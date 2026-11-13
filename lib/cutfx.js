import { useSyncExternalStore } from 'react'

// The act cuts' live state: written by the five DOM cuts (Cut.jsx), read by
// the one WebGL layer that dresses all of them (CutFX.jsx).
//
// A plain mutable object on purpose. A cut writes it on every scroll frame
// and the overlay reads it on every render frame, and neither should go
// through React for that. Only a change of active cut notifies, so the
// overlay re-renders twice per cut: once as it starts, once as it ends.

// The shot list, by the cut's scroll progress p: 0 when the cut's top meets
// the bottom of the screen, 1 when its bottom leaves the top. A 180svh cut is
// pinned from about 0.36 to 0.64. Each entry is [stops, values] for framer's
// useTransform (spread it) and for ramp() below, so the DOM and the WebGL
// layer can never drift apart.
export const CUT = {
  // The frame across a dark room fades up, then the camera pushes in.
  frame: [
    [0.08, 0.24, 0.8, 0.96],
    [0, 1, 1, 0],
  ],
  push: [
    [0.12, 0.38],
    [0.78, 1],
  ],
  // Letterbox: closes as the cut takes the screen, opens as the next scene
  // begins (the frame opening up to full IMAX height).
  bars: [
    [0.22, 0.36, 0.64, 0.8],
    [0, 1, 1, 0],
  ],
  // The title passes the lens: whoosh, flash, shockwave.
  pass: 0.62,
  // The narrator starts as the title arrives.
  narrate: 0.3,
  // The overlay runs only inside this window (its own fades sit within it).
  live: [0.12, 0.88],
}

// Piecewise-linear and clamped, exactly like framer's useTransform.
export function ramp(v, [stops, values]) {
  if (v <= stops[0]) return values[0]
  for (let i = 1; i < stops.length; i++) {
    if (v < stops[i]) {
      const t = (v - stops[i - 1]) / (stops[i] - stops[i - 1])
      return values[i - 1] + (values[i] - values[i - 1]) * t
    }
  }
  return values[values.length - 1]
}

// The letterbox bar height film.css gives .cut__bar, in px: a true 2.39:1
// frame on landscape screens (capped so a near-square window keeps a
// picture), a slim fixed bar on portrait ones.
export function letterbox(width, height) {
  if (height >= width) return 0.08 * height
  return Math.min(Math.max(0, (height - width / 2.39) / 2), 0.24 * height)
}

export const cut = {
  active: -1, // index of the cut being played, -1 when none
  act: '', // its numeral, 'I'..'V'
  field: false, // inside the mid-page field (its shader shows through the frame)
  p: 0,
  velocity: 0, // dp/dt per second, signed
  at: 0, // performance.now() of the last write, so a reader can spot a stale velocity
  top: 0, // the stage's top edge in viewport px: it scrolls in, pins at 0, scrolls out
  height: 0, // the stage's height in px
  pass: -Infinity, // performance.now() when the title last passed the lens
}

const subs = new Set()
const notify = () => subs.forEach((fn) => fn())

export function enterCut(index, act, field) {
  if (cut.active === index) return
  cut.active = index
  cut.act = act
  cut.field = field
  notify()
}

export function leaveCut(index) {
  if (cut.active !== index) return
  cut.active = -1
  notify()
}

export function writeCut(p, velocity, top, height) {
  cut.p = p
  cut.velocity = velocity
  cut.top = top
  cut.height = height
  cut.at = performance.now()
}

export function markPass() {
  cut.pass = performance.now()
}

// Fires only when a cut starts or stops playing.
export function subscribeCut(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function useActiveCut() {
  return useSyncExternalStore(subscribeCut, () => cut.active, () => -1)
}
