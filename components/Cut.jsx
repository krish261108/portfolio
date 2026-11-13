import { useEffect, useMemo, useRef } from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { narrate } from '../lib/voice'
import { musicSwell, whoosh } from '../lib/sound'
import { CUT, enterCut, leaveCut, markPass, ramp, writeCut } from '../lib/cutfx'
import './film.css'

// Where the screenplay slug types itself out, by p.
const SLUG = [0.3, 0.44]
// Past this speed (p per second, about 8000px/s on a laptop) the visitor is
// flying past on a jump (a nav link, the scrubber), not watching: no whoosh,
// flash or narration for a cut that is only passed through.
const FLYBY = 3.5

// One act's title sequence. The section is tall and its stage is pinned, so
// the scroll plays it like a shot: the frame pushes in from far away, the
// 2.39:1 letterbox closes, the screenplay slug types itself out under the act
// number, and the title flies toward the camera and through the lens in a
// streak of anamorphic flare. As the next scene starts the bars pull back and
// the frame opens to its full height. The narrator speaks over it (voice and
// global subtitles); CutFX lays the WebGL light tunnel on top.
//
// It never wraps the real sections: a transform on an ancestor would break
// their position: sticky (the work ring, the showcase), so each act is its
// own block placed in front of the section it opens.
export default function Cut({ scene, index, total, inField = false }) {
  const ref = useRef(null)
  const stageRef = useRef(null)
  const typeRef = useRef(null)
  const caretRef = useRef(null)
  const flashRef = useRef(null)
  const reduced = useReducedMotion()
  // 0 when the cut's top meets the bottom of the screen, 1 when its bottom
  // leaves the top. With the cut at 180svh the stage is pinned from about
  // 0.36 to 0.64. The timings shared with the WebGL layer live in CUT.
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'end start'] })

  // The frame starts small and rounded, like a screen across a dark room,
  // and the camera pushes in until it fills the view.
  // Only scale and opacity animate: they run on the compositor. Animating the
  // corner radius repainted the whole full-screen frame on every frame.
  const frameScale = useTransform(p, ...CUT.push)
  const frameOpacity = useTransform(p, ...CUT.frame)
  const bars = useTransform(p, ...CUT.bars)
  // Each bar's inner edge rides with it as a separate hairline (a 1px line
  // inside the scaled bar would be squashed to nothing), flashing as the bars
  // pull back. Translated by its own height, which equals the bar's.
  const edgeTop = useTransform(bars, (s) => `${(s - 1) * 100}%`)
  const edgeBottom = useTransform(bars, (s) => `${(1 - s) * 100}%`)
  const edgeOpacity = useTransform(p, [0.63, 0.665, 0.74, 0.8], [0, 1, 0.45, 0])

  // The title travels from deep in the scene, through the screen plane, and
  // past the camera.
  // Capped at 3x and faded by then: past that the browser re-rasterises
  // enormous text every frame for no visible gain.
  const titleScale = useTransform(p, [0.18, 0.46, 0.66], [0.5, 1, 3])
  const titleOpacity = useTransform(p, [0.2, 0.32, 0.56, 0.66], [0, 1, 1, 0])
  const metaOpacity = useTransform(p, [0.26, 0.36, 0.52, 0.6], [0, 1, 1, 0])
  const metaY = useTransform(p, [0.26, 0.4, 0.6], [14, 0, -10])
  const streakX = useTransform(p, [0.2, 0.8], ['-30%', '30%'])

  // Anamorphic flare: a thin, very wide streak sweeping across and brightening
  // as the title reaches the lens, its faint lime ghost mirrored opposite.
  const flareOpacity = useTransform(p, [0.5, 0.6, 0.635, 0.7], [0, 0.7, 1, 0])
  const flareX = useTransform(p, [0.5, 0.7], ['-22vw', '18vw'])
  const flareScale = useTransform(p, [0.5, 0.63, 0.7], [0.45, 1.15, 1.5])
  const ghostOpacity = useTransform(p, [0.54, 0.62, 0.69], [0, 0.6, 0])
  const ghostX = useTransform(p, [0.5, 0.7], ['14vw', '-10vw'])

  // Layout the WebGL layer needs to sit its effects inside this frame. Kept
  // up to date by observers, so the scroll path never measures anything.
  const dims = useRef({ cut: 0, stage: 0, view: 0 })
  useEffect(() => {
    const el = ref.current
    const stage = stageRef.current
    if (!el || !stage) return undefined
    const measure = () => {
      dims.current.cut = el.clientHeight
      dims.current.stage = stage.clientHeight
      // The same viewport length framer measures progress against.
      dims.current.view = document.documentElement.clientHeight
    }
    measure()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    ro?.observe(stage)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // The stage's top edge in viewport px at progress v: scrolling in from
  // below, pinned at 0, then scrolling out above.
  const stageTop = (v) => {
    const { cut: hc, stage: hs, view: vh } = dims.current
    const top = vh - v * (hc + vh)
    return Math.max(top, Math.min(0, top + hc - hs))
  }

  // Stop claiming the overlay if this cut goes away while playing.
  useEffect(() => () => leaveCut(index), [index])

  // The slug types in character by character. Written straight to the DOM
  // from the scroll, and only when the typed count actually moves.
  const chars = useMemo(() => Array.from(scene.slug || ''), [scene.slug])
  const typed = useRef({ k: -1, live: false, shown: [] })
  const type = (v) => {
    const el = typeRef.current
    if (!el) return
    const t = typed.current
    // Quarter-character steps: smooth enough, and most frames write nothing.
    const k = Math.round(ramp(v, [SLUG, [0, chars.length]]) * 4) / 4
    if (k !== t.k) {
      t.k = k
      for (let i = 0; i < chars.length; i++) {
        const o = Math.min(1, Math.max(0, k - i))
        if (o !== t.shown[i]) {
          t.shown[i] = o
          el.children[i].style.opacity = o
        }
      }
      // Monospace, so a character cell is exactly 1ch plus the tracking.
      if (caretRef.current) caretRef.current.style.transform = `translateX(calc(${Math.floor(k)} * (1ch + var(--slug-ls))))`
    }
    // The caret blinks only while the slug is on screen.
    const live = v > SLUG[0] - 0.02 && v < 0.6
    if (live !== t.live) {
      t.live = live
      el.classList.toggle('is-live', live)
    }
  }

  // The narrator comes in as the title arrives. A short settle first, so a
  // cut that is only flown past on the way somewhere else stays silent (and
  // keeps its narration for when the visitor actually watches it).
  const cueTimer = useRef(0)
  useEffect(() => () => clearTimeout(cueTimer.current), [])
  const cue = () => {
    clearTimeout(cueTimer.current)
    cueTimer.current = setTimeout(() => {
      const v = p.get()
      const inView = v >= CUT.narrate - 0.02 && v < (reduced ? 0.8 : 0.74)
      if (inView && Math.abs(p.getVelocity()) < FLYBY) narrate(scene.vo)
    }, 140)
  }

  // A white spike at the pass. A compositor animation on opacity: it is an
  // instant in time, so it is not scrubbed by the scroll.
  const flash = () => {
    flashRef.current?.animate?.([{ opacity: 0 }, { opacity: 0.2, offset: 0.08 }, { opacity: 0 }], {
      duration: 720,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    })
  }

  const last = useRef(0)
  useMotionValueEvent(p, 'change', (v) => {
    const prev = last.current
    last.current = v

    if (!reduced) {
      // Publish the live state for the WebGL layer: no React, just numbers.
      if (v > CUT.live[0] && v < CUT.live[1]) {
        enterCut(index, scene.act, inField)
        writeCut(v, p.getVelocity(), stageTop(v), dims.current.stage || window.innerHeight)
      } else leaveCut(index)
      type(v)
    }

    // First crossing going down; narrate() itself plays each act once a visit.
    if (prev < CUT.narrate && v >= CUT.narrate) cue()

    // The whoosh lands as the title passes the lens, once each way.
    const crossed = (prev < CUT.pass && v >= CUT.pass) || (prev > CUT.pass && v <= CUT.pass)
    if (crossed && !reduced && Math.abs(p.getVelocity()) < FLYBY) {
      whoosh({ gain: 0.08 })
      musicSwell()
      markPass()
      flash()
    }
  })

  const [first, second] = scene.title

  return (
    <div
      className={`cut${inField ? ' cut--field' : ''}${reduced ? ' cut--still' : ''}`}
      ref={ref}
      data-act={scene.act}
      data-index={index}
      aria-label={`Act ${scene.act}: ${first} ${second}`}
      role="region"
    >
      <div className="cut__stage" ref={stageRef}>
        <motion.div
          className="cut__frame"
          style={reduced ? undefined : { scale: frameScale, opacity: frameOpacity }}
          aria-hidden="true"
        >
          <motion.div className="cut__streaks" style={reduced ? undefined : { x: streakX }} />
        </motion.div>

        {!reduced && (
          <>
            <motion.div
              className="cut__flare"
              style={{ x: flareX, scaleX: flareScale, opacity: flareOpacity }}
              aria-hidden="true"
            />
            <motion.div className="cut__ghost" style={{ x: ghostX, opacity: ghostOpacity }} aria-hidden="true" />
          </>
        )}

        <div className="cut__copy">
          <motion.div className="cut__meta" style={reduced ? undefined : { opacity: metaOpacity, y: metaY }}>
            <p className="cut__kicker">
              Act {scene.act} <span>·</span> Scene {index + 1} of {total}
            </p>
            {chars.length > 0 && (
              <p className="cut__slug">
                <span className="cut__type" ref={typeRef} aria-hidden="true">
                  {chars.map((c, i) => (
                    <span className="cut__ch" key={i}>
                      {c}
                    </span>
                  ))}
                  {!reduced && <span className="cut__caret" ref={caretRef} />}
                </span>
                <span className="sr-only">{scene.slug}</span>
              </p>
            )}
          </motion.div>
          <motion.h2 className="cut__title" style={reduced ? undefined : { scale: titleScale, opacity: titleOpacity }}>
            {first} <em>{second}</em>
          </motion.h2>
        </div>

        {!reduced && <div className="cut__flash" ref={flashRef} aria-hidden="true" />}

        {/* Fixed to the screen, not the stage: they close while the stage is
            still arriving and open while the next scene scrolls in. */}
        <motion.div className="cut__bar cut__bar--top" style={reduced ? undefined : { scaleY: bars }} aria-hidden="true" />
        <motion.div
          className="cut__bar cut__bar--bottom"
          style={reduced ? undefined : { scaleY: bars }}
          aria-hidden="true"
        />
        {!reduced && (
          <>
            <motion.div className="cut__edge cut__edge--top" style={{ y: edgeTop, opacity: edgeOpacity }} aria-hidden="true" />
            <motion.div
              className="cut__edge cut__edge--bottom"
              style={{ y: edgeBottom, opacity: edgeOpacity }}
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </div>
  )
}
