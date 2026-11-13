import { useSyncExternalStore } from 'react'
import { audioContext, duckMusic, sound } from './sound'
import { voiceover } from '../data'

// The narrator. Each line of the script (data.js `voiceover`) is its own
// audio file, rendered by `npm run voiceover`, so its subtitle sits exactly on
// it. Lines play through a small vocal chain (warmth, presence, compression,
// a touch of room) with the score ducked underneath, the way a film is mixed.
//
// With sound off, or before the visitor has interacted, the same lines still
// run as subtitles on the same timing: the acts are written as well as spoken.

// Playback rate from the manifest: the robotic macOS voices are slowed and
// lowered a touch; a neural voice or a real recording plays as rendered.
let RATE = 1
const GAP_MS = 380 // breath between lines

let manifestPromise = null
const raw = new Map() // file -> Promise<ArrayBuffer>
const decoded = new Map() // file -> Promise<AudioBuffer>
const played = new Set()
let generation = 0
let queue = Promise.resolve()
let speaking = 0 // narration blocks in progress
const busySubs = new Set()
function setSpeaking(delta) {
  speaking = Math.max(0, speaking + delta)
  busySubs.forEach((fn) => fn(speaking > 0))
}
let current = null
let chain = null

let caption = null
const subs = new Set()
function setCaption(next) {
  caption = next
  subs.forEach((fn) => fn())
}

export function subscribeCaption(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// { text, key, ms } | null
export function useCaption() {
  return useSyncExternalStore(subscribeCaption, () => caption, () => caption)
}

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('/vo/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m && typeof m.playbackRate === 'number') RATE = m.playbackRate
        return m
      })
      .catch(() => null)
  }
  return manifestPromise
}

function fetchRaw(file) {
  if (!raw.has(file)) {
    raw.set(
      file,
      fetch(file).then((r) => {
        if (!r.ok) throw new Error(`voice: ${file} ${r.status}`)
        return r.arrayBuffer()
      })
    )
  }
  return raw.get(file)
}

function decode(ctx, file) {
  if (!decoded.has(file)) {
    // decodeAudioData detaches its input, so hand it a copy.
    decoded.set(file, fetchRaw(file).then((ab) => ctx.decodeAudioData(ab.slice(0))))
  }
  return decoded.get(file)
}

// Fetch the script's audio ahead of time, in idle moments, so no line ever
// waits on the network. Decoding happens on first play (it needs an
// AudioContext, which needs a gesture).
export function prefetchVoice() {
  loadManifest().then((m) => {
    if (!m) return
    const files = Object.values(m.lines).flat().map((l) => l.file)
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 120))
    const next = (i) => {
      if (i >= files.length) return
      idle(() => fetchRaw(files[i]).catch(() => {}).finally(() => next(i + 1)), { timeout: 2000 })
    }
    next(0)
  })
}

function makeRoom(ctx) {
  const len = Math.floor(ctx.sampleRate * 1.1)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4)
  }
  const conv = ctx.createConvolver()
  conv.buffer = ir
  return conv
}

function voiceInput(ctx) {
  if (chain && chain.ctx === ctx) return chain.input
  const input = ctx.createGain()
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 85
  const warmth = ctx.createBiquadFilter()
  warmth.type = 'lowshelf'
  warmth.frequency.value = 220
  warmth.gain.value = 3.5
  const presence = ctx.createBiquadFilter()
  presence.type = 'peaking'
  presence.frequency.value = 3200
  presence.Q.value = 0.8
  presence.gain.value = 2.5
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -24
  comp.knee.value = 8
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.2
  const makeup = ctx.createGain()
  makeup.gain.value = 1.1
  // A brick wall last, so the makeup gain can never clip.
  const limiter = ctx.createDynamicsCompressor()
  // -4 dB leaves headroom for the (ducked) score playing underneath.
  limiter.threshold.value = -4
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.08
  const send = ctx.createGain()
  send.gain.value = 0.12
  const room = makeRoom(ctx)

  input.connect(hp).connect(warmth).connect(presence).connect(comp).connect(makeup)
  makeup.connect(limiter)
  makeup.connect(send).connect(room).connect(limiter)
  limiter.connect(ctx.destination)
  chain = { ctx, input }
  return input
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// How long a subtitle needs on screen to be read, if there is no audio.
const readingMs = (text, audioSeconds) => Math.max((audioSeconds / RATE) * 1000, text.length * 62, 1500) + 250

async function speakLine(line, key, gen) {
  const ctx = line.file ? audioContext() : null
  let buffer = null
  if (ctx) {
    try {
      buffer = await decode(ctx, line.file)
    } catch {
      buffer = null // missing or broken file: fall back to the subtitle alone
    }
  }
  if (gen !== generation) return

  if (!buffer || !sound.on) {
    const ms = readingMs(line.text, line.duration || 0)
    setCaption({ text: line.text, key, ms })
    await wait(ms)
    return
  }

  const ms = (buffer.duration / RATE) * 1000
  setCaption({ text: line.text, key, ms })
  duckMusic(true)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = RATE
  const gain = ctx.createGain()
  src.connect(gain).connect(voiceInput(ctx))
  current = { src, gain, ctx }
  await new Promise((resolve) => {
    const safety = setTimeout(resolve, ms + 1500)
    src.onended = () => {
      clearTimeout(safety)
      resolve()
    }
    src.start()
  })
  if (current?.src === src) current = null
  // Hold the last words on screen a moment after they are spoken.
  await wait(220)
}

async function perform(key, gen) {
  if (gen !== generation) return
  setSpeaking(1)
  try {
    await performLines(key, gen)
  } finally {
    setSpeaking(-1)
  }
}

async function performLines(key, gen) {
  const manifest = await loadManifest()
  const lines =
    manifest?.lines?.[key] ?? (voiceover[key] || []).map((text) => ({ text, file: null, duration: 0 }))
  for (let i = 0; i < lines.length; i++) {
    if (gen !== generation) return
    await speakLine(lines[i], `${key}-${i}`, gen)
    if (gen !== generation) return
    if (i < lines.length - 1) {
      setCaption(null)
      await wait(GAP_MS)
    }
  }
  if (gen === generation) {
    setCaption(null)
    duckMusic(false)
  }
}

function stopAudio(fadeSeconds = 0.15) {
  const c = current
  current = null
  if (!c) return
  const t = c.ctx.currentTime
  c.gain.gain.setValueAtTime(c.gain.gain.value, t)
  c.gain.gain.linearRampToValueAtTime(0, t + fadeSeconds)
  try {
    c.src.stop(t + fadeSeconds + 0.02)
  } catch {
    /* already stopped */
  }
}

// Cut the narration short (a new scene is starting, or the visitor muted).
export function stopNarration() {
  generation++
  queue = Promise.resolve()
  stopAudio()
  setCaption(null)
  duckMusic(false)
}

/**
 * Speak one block of the script (a key of data.js `voiceover`).
 * - once: each block plays a single time per visit unless forced.
 * - queue: wait for whatever is speaking to finish instead of cutting it off.
 */
export function narrate(key, { queue: enqueue = false, once = true } = {}) {
  if (!voiceover[key]) return Promise.resolve()
  if (once && played.has(key)) return Promise.resolve()
  played.add(key)
  if (!enqueue) stopNarration()
  const gen = generation
  queue = queue.then(() => perform(key, gen)).catch(() => {})
  return queue
}

// True while any narration (voice or subtitle-only) is playing.
export function isNarrating() {
  return speaking > 0
}

export function subscribeNarrating(fn) {
  busySubs.add(fn)
  return () => busySubs.delete(fn)
}

// Resolves once the narrator has nothing left to say, including blocks that
// were queued while waiting.
export async function waitForNarration() {
  let q
  do {
    q = queue
    await q
  } while (q !== queue)
}

// Muting mid-line stops the voice; the remaining lines carry on as subtitles.
sound.subscribe((on) => {
  if (!on) {
    stopAudio(0.25)
    duckMusic(false)
  }
})
