import { scrollImmediate, scrollToY } from './scroll'
import { isNarrating, narrate, subscribeNarrating, waitForNarration } from './voice'
import { OPENING_LENGTH, openingTime, replayOpening } from './film'
import { blip } from './sound'
import { projects } from '../data'

// "Watch the film": an autopilot that plays the page as a movie. It drives the
// scroll itself, a frame at a time, like a camera on a dolly: it eases out of
// rest, cruises, and brakes into each beat of the story, where it holds. Every
// act's title until the narrator has finished, every project on the ring, the
// finale, and then it rolls the end credits to the last frame.
//
// The visitor always wins. A wheel, a touch, a click, a navigation key, an open
// modal or a hidden tab stops it on the spot, and playing again carries on from
// wherever they are.

const PACE = 0.45 // cruise, in viewport heights per second
const SLOW = 0.3 // through About and the end credits
const RAMP = 1.6 // seconds to ease from rest up to cruise
const BRAKE = 2.6 // seconds to ease from cruise into a hold
const BEAT = 0.45 // held after the narrator's last word
const TITLE = 0.47 // a cut's scroll progress where its title is face-on
const CARD_HOLD = 1.8
const SETTLE = 2 // frames after starting in which an outside move is adopted, not obeyed

let state = 'idle' // idle | playing | paused | ended | rewinding
let snapshot = { state }
const subs = new Set()

function setState(next) {
  if (next === state) return
  state = next
  snapshot = { state }
  subs.forEach((fn) => fn())
}

export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// { state }: replaced on every change, so it suits useSyncExternalStore.
export function getSnapshot() {
  return snapshot
}

// The end-credits section, whatever shape it takes.
export function findCredits() {
  const direct = document.getElementById('credits') || document.querySelector('[aria-label="End credits"]')
  if (direct) return direct
  const contact = document.getElementById('contact')
  for (const el of document.querySelectorAll('[class*="credit"]')) {
    if (!contact || contact.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) return el
  }
  return null
}

// ---------------------------------------------------------------------------
// Motion

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
// Where on the ramp smooth() reaches `s`: motion already under way can be
// re-planned without a jump in speed.
const unsmooth = (s) => (s <= 0 ? 0 : s >= 1 ? 1 : 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3))
// Distance covered (in units of v0 * T) while the speed falls from v0 to rest
// as v0 * (1 - smooth(x)): no jolt where braking begins, none where it ends.
// It reaches 0.5 at x = 1, so stopping within d takes T = 2d / v0.
const coast = (x) => x - x * x * x + 0.5 * x * x * x * x

let mounted = 0
let raf = 0
let last = 0 // previous frame's timestamp, ms
let clock = 0 // film time in seconds, advanced by clamped frame deltas
let reduced = false
let plan = null
let planDirty = true
let resync = false
let settle = 0
let y = 0 // where the camera is, fractional px
let seen = 0 // the scroll position read back after our last write
let v = 0 // px/s
let cruise = 0 // smoothed cruise speed, px/s
let move = null // { stop, t0, brake: { y0, v0, t0, T } | null }
let hold = null // { stop, t0, heard, done, doneAt, cued }
let opening = null // { cap, doneAt } while the opening shot plays out
let glide = null // a soft pause easing to rest: { y0, v0, t0, T }
let heardFrom = 0 // narration starting after this (ms) belongs to the next beat
let narrationAt = -Infinity
let rewindToken = 0
// Trackpad momentum left over from before play was pressed, which is not the
// visitor taking the wheel back.
let lastWheel = -Infinity
let lastDelta = 0
let coasting = false
let coastUntil = 0

const ramp = () => (reduced ? 2.4 : RAMP)
const brake = () => (reduced ? 3.4 : BRAKE)
const locked = () => document.documentElement.classList.contains('is-locked')

// Every beat the camera holds on, and the stretches it takes slowly, measured
// from the page so it follows whatever the sections and data.js add up to.
function measure() {
  const doc = document.documentElement
  const vh = doc.clientHeight || window.innerHeight
  const sy = window.scrollY
  const top = (el) => el.getBoundingClientRect().top + sy
  const max = Math.max(0, doc.scrollHeight - vh)
  const stops = []

  // Same basis as the cut's own scroll progress: 0 as its top meets the bottom
  // of the screen, 1 as its bottom leaves the top.
  document.querySelectorAll('.cut').forEach((el, i) => {
    const at = top(el) + TITLE * (el.offsetHeight + vh) - vh
    stops.push({ id: `cut-${i}`, kind: 'cut', y: at, min: 1.6, max: 8, listen: 1.6 })
  })

  // Exactly where the ring shows each card face-on (Work's own geometry), so
  // its snap-to-card never has anything to correct.
  const work = document.getElementById('work')
  const n = projects.length
  if (work && n) {
    const t = top(work)
    const step = (work.offsetHeight - vh) / Math.max(1, n - 1)
    for (let i = 0; i < n; i++) stops.push({ id: `card-${i}`, kind: 'card', y: t + step * i, min: CARD_HOLD, max: CARD_HOLD })
  }

  const contact = document.getElementById('contact')
  if (contact) {
    const at = top(contact) + (contact.offsetHeight - vh) / 2
    stops.push({ id: 'finale', kind: 'finale', y: at, min: 2.4, max: 8, listen: 2.4, cue: 'finale' })
  }

  stops.push({ id: 'end', kind: 'end', y: max })
  stops.forEach((s) => (s.y = Math.max(0, Math.min(max, s.y))))
  stops.sort((a, b) => a.y - b.y)

  const zones = []
  const about = document.getElementById('about')
  if (about) {
    const t = top(about)
    // From its words starting to light up to its stats leaving.
    zones.push([t - 0.9 * vh, t + about.offsetHeight - 0.4 * vh])
  }
  const credits = findCredits()
  const roll = credits ? top(credits) - 0.6 * vh : contact ? top(contact) + contact.offsetHeight - 0.5 * vh : max
  zones.push([roll, Infinity])

  return { vh, max, stops, zones }
}

// Cruise speed at a scroll position, blended over a third of a screen at each
// zone edge so the pace never steps.
function cruiseAt(at) {
  const band = plan.vh * 0.3
  let slow = 0
  for (const [from, to] of plan.zones) {
    const w = smooth((at - from + band) / (2 * band)) * (1 - smooth((at - to + band) / (2 * band)))
    if (w > slow) slow = w
  }
  return (PACE + (SLOW - PACE) * slow) * plan.vh * (reduced ? 0.7 : 1)
}

const nextStop = (from) => plan.stops.find((s) => s.y > from + 1) || null

function write() {
  scrollImmediate(y)
  seen = window.scrollY
}

// Head for the next beat. `speed` is how fast the camera is already moving.
function startMove(speed) {
  const stop = nextStop(y)
  if (!stop) return finish()
  cruise = Math.max(cruiseAt(y), speed)
  const along = cruise > 0 ? unsmooth(speed / cruise) : 0
  move = { stop, t0: clock - along * ramp(), brake: null }
  hold = null
  return undefined
}

function stepMove(dt) {
  const m = move
  const target = m.stop.y
  if (m.brake) {
    const b = m.brake
    const x = Math.min(1, (clock - b.t0) / b.T)
    y = b.y0 + b.v0 * b.T * coast(x)
    v = b.v0 * (1 - smooth(x))
    if (x >= 1) {
      y = target
      v = 0
      write()
      return arrive()
    }
    return write()
  }
  cruise += (cruiseAt(y) - cruise) * (1 - Math.exp(-dt / 0.8))
  v = cruise * smooth((clock - m.t0) / ramp())
  const d = target - y
  if (d <= 0.75) {
    y = target
    v = 0
    write()
    return arrive()
  }
  if (v > 1 && v * brake() * 0.5 >= d) {
    // Brake from where this frame began, so the switch costs no frame.
    m.brake = { y0: y, v0: v, t0: clock - dt, T: (2 * d) / v }
    return stepMove(0)
  }
  y = Math.min(target, y + v * dt)
  return write()
}

function arrive() {
  const stop = move.stop
  move = null
  v = 0
  if (stop.kind === 'end') return finish()
  hold = { stop, t0: clock, heard: false, done: false, doneAt: 0, cued: false }
  // Narration that began on the way in belongs to this beat.
  if (stop.listen && (isNarrating() || narrationAt >= heardFrom)) hear(hold)
  return undefined
}

function hear(h) {
  h.heard = true
  waitForNarration().then(() => {
    if (hold !== h) return
    h.done = true
    h.doneAt = clock
  })
}

function stepHold() {
  const h = hold
  const s = h.stop
  const t = clock - h.t0
  let ready = t >= s.min
  if (s.listen) {
    if (!h.heard && isNarrating()) hear(h)
    // Nobody spoke the finale on the way in: cue it here. Each block plays
    // once per visit, so this never repeats one that already ran.
    if (s.cue && !h.heard && !h.cued && t >= 1) {
      h.cued = true
      narrate(s.cue, { queue: true })
    }
    ready = ready && (h.heard ? h.done && clock - h.doneAt >= BEAT : t >= s.listen)
  }
  if (ready || t >= s.max) {
    hold = null
    heardFrom = performance.now()
    startMove(0)
  }
}

function stepOpening() {
  const o = opening
  if (openingTime() < OPENING_LENGTH && clock < o.cap) return
  if (o.doneAt === null) o.doneAt = clock
  // Let the narrator finish the opening lines before the camera moves.
  if (isNarrating() && clock - o.doneAt < 3.5) return
  opening = null
  heardFrom = performance.now()
  startMove(0)
}

function stepGlide() {
  const g = glide
  const x = Math.min(1, (clock - g.t0) / g.T)
  y = Math.min(plan.max, g.y0 + g.v0 * g.T * coast(x))
  write()
  if (x >= 1) halt()
}

// The layout moved (a resize, something above changing height): re-measure
// and carry on toward the same beat without a jump in speed.
function replan() {
  planDirty = false
  plan = measure()
  if (move) {
    const s = plan.stops.find((st) => st.id === move.stop.id)
    if (!s || s.y <= y + 0.75) return startMove(v)
    move.stop = s
    if (!move.brake) return undefined
    const d = s.y - y
    if (v > 1 && d <= v * brake() * 0.5) move.brake = { y0: y, v0: v, t0: clock, T: (2 * d) / v }
    else startMove(v)
  } else if (hold) {
    const s = plan.stops.find((st) => st.id === hold.stop.id)
    // The beat we are holding on moved further down: follow it and hold again.
    if (s && s.y > y + 1.5) startMove(0)
  }
  return undefined
}

function tick(now) {
  raf = requestAnimationFrame(tick)
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
  last = now
  if (state !== 'playing' && !glide) return halt()
  if (locked()) return interrupt()
  const actual = window.scrollY
  const drift = Math.abs(actual - seen) > 2
  if (resync || (drift && settle > 0)) {
    // Adopt where the page really is: a re-layout, or a glide just cut off.
    resync = false
    y = actual
    seen = actual
    planDirty = true
  } else if (drift) {
    // Something other than the camera moved the page: the visitor has it.
    return interrupt()
  }
  if (settle > 0) settle--
  clock += dt
  if (planDirty) replan()
  if (state !== 'playing' && !glide) return undefined
  if (glide) return stepGlide()
  if (opening) return stepOpening()
  if (hold) return stepHold()
  if (move) return stepMove(dt)
  return startMove(0)
}

function halt() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  move = hold = opening = glide = null
  v = 0
}

function finish() {
  halt()
  setState('ended')
}

// The visitor took over: stop dead, right where the page is.
function interrupt() {
  const rewinding = state === 'rewinding'
  if (state !== 'playing' && !rewinding && !glide) return
  halt()
  rewindToken++
  if (rewinding) scrollImmediate(window.scrollY) // cut the rewind's glide short
  setState('paused')
}

function start() {
  if (!mounted || state === 'playing' || locked()) return
  const speed = glide ? v : 0
  halt()
  rewindToken++
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  plan = measure()
  planDirty = false
  // Take the page from wherever it is, cancelling any glide still running.
  y = window.scrollY
  scrollImmediate(y)
  seen = window.scrollY
  y = seen
  settle = SETTLE
  clock = 0
  last = performance.now()
  heardFrom = last
  coasting = last - lastWheel < 140
  coastUntil = last + 2500
  setState('playing')
  if (y < plan.vh * 0.5 && openingTime() < OPENING_LENGTH) {
    // At the top during the opening shot: let it finish first.
    opening = { cap: OPENING_LENGTH - openingTime() + 2, doneAt: null }
  } else startMove(speed)
  if (state === 'playing') raf = requestAnimationFrame(tick)
}

// Pausing from the controls eases the camera to rest over a moment; the
// visitor taking the wheel stops it at once (interrupt).
function softPause() {
  if (state !== 'playing') return
  if (move && v > 30) {
    const g = { y0: y, v0: v, t0: clock, T: reduced ? 1 : 0.7 }
    move = hold = opening = null
    glide = g
    setState('paused')
    return
  }
  halt()
  setState('paused')
}

export function play() {
  start()
}

export function pause() {
  softPause()
}

// Back to the top in one long glide, the opening shot rolls again, and the
// film plays from the start.
export function watchAgain() {
  if (!mounted) return
  halt()
  const token = ++rewindToken
  blip({ freq: 520, dur: 0.09 })
  setState('rewinding')
  scrollToY(0, {
    duration: 2.6,
    onComplete: () => {
      // Two frames' grace: the rewind's last scroll event lands before the
      // opening restarts, so nothing mistakes it for the visitor skipping it.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (token !== rewindToken || state !== 'rewinding') return
          replayOpening()
          start()
        })
      )
    },
  })
}

// The player button and the K key.
export function toggle() {
  if (state === 'playing') {
    blip({ freq: 440, dur: 0.07 })
    softPause()
  } else if (state === 'rewinding') interrupt()
  else if (state === 'ended') watchAgain()
  else {
    blip({ freq: 660, dur: 0.08 })
    start()
  }
}

// ---------------------------------------------------------------------------
// Listening for the visitor

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End'])

const editable = (t) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/**
 * Wire the autopilot to the page. `getRoot` returns the player's element:
 * presses inside it are the controls, not the visitor taking over. Returns a
 * cleanup that removes every listener and stops the camera.
 */
export function mountAutopilot(getRoot) {
  mounted++
  const inPlayer = (t) => {
    const root = getRoot?.()
    return !!root && t instanceof Node && root.contains(t)
  }
  // Muting is not taking the wheel: the sound toggle never stops the film.
  const harmless = (t) => inPlayer(t) || (t instanceof Element && !!t.closest('.nav__sound'))

  const onWheel = (e) => {
    const now = performance.now()
    const gap = now - lastWheel
    const size = Math.abs(e.deltaX) + Math.abs(e.deltaY)
    const prev = lastDelta
    lastWheel = now
    lastDelta = size
    if (state !== 'playing' && state !== 'rewinding' && !glide) return
    if (coasting && state === 'playing') {
      // Momentum decays steadily with no gaps; a fresh gesture breaks the run.
      if (gap < 140 && now < coastUntil && size <= prev * 1.15 + 1) {
        if (e.cancelable) e.preventDefault()
        e.lenisStopPropagation = true // Lenis ignores it too
        return
      }
      coasting = false
    }
    interrupt()
  }
  let touchInPlayer = false
  const onTouchStart = (e) => {
    touchInPlayer = harmless(e.target)
    if (!touchInPlayer) interrupt()
  }
  const onTouchMove = () => {
    if (!touchInPlayer) interrupt()
  }
  const onPointerDown = (e) => {
    if (!harmless(e.target)) interrupt()
  }
  const onKeyDown = (e) => {
    const t = e.target
    if ((e.key === 'k' || e.key === 'K') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (!e.repeat && !editable(t) && !locked()) toggle()
      return
    }
    if (!NAV_KEYS.has(e.key) || editable(t)) return
    // Space on the player (or the sound toggle) presses it; it does not scroll.
    if ((e.key === ' ' || e.key === 'Spacebar') && harmless(t)) return
    interrupt()
  }
  const onVisibility = () => {
    if (document.hidden) interrupt()
  }
  const onResize = () => {
    planDirty = true
    resync = true
  }
  const onScroll = () => {
    // Back up from the end credits by hand: it is a film to watch again from there.
    if (state === 'ended' && plan && window.scrollY < plan.max - plan.vh * 0.75) setState('idle')
  }
  const unhear = subscribeNarrating((on) => {
    if (on) narrationAt = performance.now()
  })
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize)
  ro?.observe(document.body)

  const passive = { capture: true, passive: true }
  window.addEventListener('wheel', onWheel, { capture: true, passive: false })
  window.addEventListener('touchstart', onTouchStart, passive)
  window.addEventListener('touchmove', onTouchMove, passive)
  window.addEventListener('pointerdown', onPointerDown, passive)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    mounted--
    window.removeEventListener('wheel', onWheel, true)
    window.removeEventListener('touchstart', onTouchStart, true)
    window.removeEventListener('touchmove', onTouchMove, true)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', onVisibility)
    ro?.disconnect()
    unhear()
    if (mounted > 0) return
    const active = state === 'playing' || state === 'rewinding' || !!glide
    halt()
    rewindToken++
    if (active) setState('paused')
  }
}
