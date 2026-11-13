import { useEffect, useState } from 'react'
import { createMusic } from './music'

// Synthesized sound kit and score, no audio files. On by default (the
// visitor's choice is remembered). Browsers only let audio start from a user
// gesture, so nothing is created until the first click, tap or key press:
// then the AudioContext starts and the score fades in.
const KEY = 'krish-sound'
let ctx = null
let music = null
let on = true
try {
  const saved = localStorage.getItem(KEY)
  if (saved !== null) on = saved === '1'
} catch {
  /* storage blocked: keep the default */
}
let unlocked = false
let scene = 'gate'
const MUSIC_LEVEL = 1.15
const subs = new Set()

function getCtx() {
  // Creating a context before any gesture only earns a blocked, suspended one
  // and a console warning; wait until the visitor has interacted.
  if (!unlocked && !navigator.userActivation?.hasBeenActive) return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function startMusic() {
  const c = getCtx()
  if (!c) return
  if (!music) {
    music = createMusic(c)
    music.setScene(scene)
    music.start()
  }
  music.setVolume(MUSIC_LEVEL, 3)
}

// The first gesture anywhere unlocks audio. Capture phase, so it runs before
// whatever the click itself does (a blip, the HOLD charge).
if (typeof window !== 'undefined') {
  const unlock = () => {
    unlocked = true
    ;['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.removeEventListener(ev, unlock, true))
    if (on) startMusic()
  }
  ;['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { capture: true, passive: true }))
}

export const sound = {
  get on() {
    return on
  },
  set(value) {
    on = value
    try {
      localStorage.setItem(KEY, on ? '1' : '0')
    } catch {
      /* not persisted: fine */
    }
    if (on) startMusic()
    else music?.setVolume(0, 0.8)
    subs.forEach((fn) => fn(on))
  },
  toggle() {
    this.set(!on)
  },
  subscribe(fn) {
    subs.add(fn)
    return () => subs.delete(fn)
  },
}

// The gate's hold-to-enter charge, 0..1: the score swells with it.
export function musicIntensity(p) {
  music?.setIntensity(p)
}

// A chapter cut: the score brightens for a moment.
export function musicSwell() {
  if (on) music?.swell()
}

// 'gate' | 'site': entering brings in the pulse.
export function musicScene(next) {
  scene = next
  music?.setScene(next)
}

// The narrator's access to the audio engine: null until the visitor has
// interacted (browsers block audio before that) or while sound is off.
export function audioContext() {
  return on ? getCtx() : null
}

let ducked = false
// Film mixing: the score dips under the narration and comes back after it.
export function duckMusic(active) {
  if (active === ducked) return
  ducked = active
  if (!music || !on) return
  music.setVolume(active ? MUSIC_LEVEL * 0.3 : MUSIC_LEVEL, active ? 0.35 : 1.6)
}

// A cinematic low hit for big reveals: a falling sub, a body of filtered
// noise and a long tail. The kind of boom a title lands on.
export function impact({ gain = 0.5 } = {}) {
  if (!on) return
  const c = getCtx()
  if (!c) return
  const t = c.currentTime + 0.01
  const out = c.createGain()
  out.gain.value = gain
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(900, t)
  lp.frequency.exponentialRampToValueAtTime(120, t + 1.8)
  lp.connect(out).connect(c.destination)

  const sub = c.createOscillator()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(62, t)
  sub.frequency.exponentialRampToValueAtTime(31, t + 2.2)
  const sg = c.createGain()
  sg.gain.setValueAtTime(0.0001, t)
  sg.gain.exponentialRampToValueAtTime(0.9, t + 0.02)
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
  sub.connect(sg).connect(lp)
  sub.start(t)
  sub.stop(t + 2.7)

  const body = c.createOscillator()
  body.type = 'sawtooth'
  body.frequency.setValueAtTime(55, t)
  body.frequency.exponentialRampToValueAtTime(36, t + 1.6)
  const bg = c.createGain()
  bg.gain.setValueAtTime(0.0001, t)
  bg.gain.exponentialRampToValueAtTime(0.22, t + 0.03)
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9)
  body.connect(bg).connect(lp)
  body.start(t)
  body.stop(t + 2)

  const len = Math.floor(c.sampleRate * 1.2)
  const noise = c.createBuffer(1, len, c.sampleRate)
  const d = noise.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const ns = c.createBufferSource()
  ns.buffer = noise
  const ng = c.createGain()
  ng.gain.value = 0.35
  ns.connect(ng).connect(lp)
  ns.start(t)
  if (music) music.swell()
}

export function useSoundOn() {
  const [value, setValue] = useState(sound.on)
  useEffect(() => sound.subscribe(setValue), [])
  return value
}

export function blip({ freq = 880, dur = 0.06, gain = 0.03, type = 'sine', delay = 0 } = {}) {
  if (!on) return
  const c = getCtx()
  if (!c) return
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  osc.frequency.exponentialRampToValueAtTime(freq * 1.4, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

export function chime() {
  ;[660, 880, 1320].forEach((freq, i) => blip({ freq, dur: 0.14, gain: 0.03, type: 'triangle', delay: i * 0.07 }))
}

// A rising hum that follows the hold-to-enter charge.
export function createCharge() {
  let osc = null
  let sub = null
  let g = null

  const start = () => {
    const c = getCtx()
    if (!c) return
    osc = c.createOscillator()
    sub = c.createOscillator()
    g = c.createGain()
    osc.type = 'sawtooth'
    sub.type = 'sine'
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    g.gain.value = 0
    osc.connect(filter)
    sub.connect(filter)
    filter.connect(g).connect(c.destination)
    osc.start()
    sub.start()
  }

  const stop = () => {
    if (!g || !ctx) return
    const t = ctx.currentTime
    g.gain.cancelScheduledValues(t)
    g.gain.setTargetAtTime(0, t, 0.04)
    const o1 = osc
    const o2 = sub
    setTimeout(() => {
      try {
        o1.stop()
        o2.stop()
      } catch {
        /* already stopped */
      }
    }, 250)
    osc = sub = g = null
  }

  return {
    update(p) {
      if (!on || p <= 0.001) {
        if (g) stop()
        return
      }
      if (!g) start()
      if (!g) return
      const t = ctx.currentTime
      osc.frequency.setTargetAtTime(55 + p * 220, t, 0.05)
      sub.frequency.setTargetAtTime(110 + p * 440, t, 0.05)
      g.gain.setTargetAtTime(0.012 + p * 0.05, t, 0.05)
    },
    stop,
  }
}

export function whoosh({ gain = 0.18 } = {}) {
  if (!on) return
  const c = getCtx()
  if (!c) return
  const len = Math.floor(c.sampleRate * 0.9)
  const buffer = c.createBuffer(1, len, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 0.9
  const t = c.currentTime
  filter.frequency.setValueAtTime(260, t)
  filter.frequency.exponentialRampToValueAtTime(3200, t + 0.7)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.08)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(t)
}
