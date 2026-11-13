import { useSyncExternalStore } from 'react'

// The opening shot's clock. It starts when the entry gate has finished
// leaving (App calls startOpening), so the shot plays where it can be seen,
// not under the gate. Everything choreographed in the opening reads
// openingTime(): the 3D camera every frame, the DOM titles on their marks.
//
// Scrolling during the opening skips to its end state; the end credits can
// replay it.

export const OPENING_LENGTH = 10 // seconds, start of shot to settled hero

let start = null
let epoch = 0
let snapshot = { started: false, epoch: 0, skipped: false }
const subs = new Set()

function emit(skipped = false) {
  snapshot = { started: start !== null, epoch, skipped }
  subs.forEach((fn) => fn())
}

export function startOpening() {
  start = performance.now()
  epoch++
  emit()
}

// Jump straight to the end state (the visitor is already scrolling away).
export function skipOpening() {
  if (start === null) return
  const done = performance.now() - OPENING_LENGTH * 1000
  if (start <= done) return
  start = done
  emit(true)
}

export const replayOpening = startOpening

// Seconds since the opening began; 0 before it starts.
export function openingTime() {
  return start === null ? 0 : (performance.now() - start) / 1000
}

export function subscribeOpening(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// { started, epoch, skipped }: epoch changes on every (re)start, so DOM
// sequences can key on it to replay.
export function useOpening() {
  return useSyncExternalStore(subscribeOpening, () => snapshot, () => snapshot)
}
