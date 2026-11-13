// An original ambient score, generated live with the Web Audio API: no files,
// no licensing. Pads drift through a slow progression, a soft bass follows the
// roots, and sparse plucks sparkle in a long reverb. After the visitor enters,
// a quiet heartbeat pulse joins in. The gate's charge opens the filter so the
// music swells as they hold.

const BPM = 76
const BEAT = 60 / BPM
const BAR = BEAT * 4
const LOOKAHEAD = 1.6 // seconds scheduled ahead: survives background-tab timer throttling
const TICK_MS = 250

// D minor, cinematic and a little hopeful: Dm9, Bbmaj7, Fmaj7/A, C(add9).
const CHORDS = [
  { root: 38, notes: [50, 53, 57, 60, 64] },
  { root: 34, notes: [46, 50, 53, 57, 62] },
  { root: 33, notes: [45, 48, 53, 57, 60] },
  { root: 36, notes: [48, 52, 55, 62, 64] },
]
const BARS_PER_CHORD = 2
// D minor pentatonic, two octaves up, for the sparkles.
const SPARKLE = [74, 77, 79, 81, 84, 86, 89, 91]

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

// Deterministic randomness so the score is the same piece every visit, but
// long enough that it never audibly repeats.
let seed = 7
const rand = () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

function makeReverb(ctx, seconds = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  const conv = ctx.createConvolver()
  conv.buffer = ir
  return conv
}

export function createMusic(ctx) {
  const out = ctx.createGain()
  out.gain.value = 0
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 3
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 1400
  tone.Q.value = 0.4
  const reverb = makeReverb(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.55
  const dry = ctx.createGain()
  dry.gain.value = 0.8

  // voices -> tone -> (dry + reverb) -> compressor -> out -> speakers
  tone.connect(dry).connect(comp)
  tone.connect(reverb).connect(wet).connect(comp)
  comp.connect(out).connect(ctx.destination)

  let timer = 0
  let nextBar = 0
  let bar = 0
  let scene = 'gate'
  let intensity = 0
  let running = false

  function pad(chord, t, dur) {
    chord.notes.forEach((m, i) => {
      // Two slightly detuned voices per note make the pad breathe.
      ;[-6, 6].forEach((cents) => {
        const o = ctx.createOscillator()
        o.type = i % 2 ? 'triangle' : 'sawtooth'
        o.frequency.value = hz(m)
        o.detune.value = cents
        const g = ctx.createGain()
        const peak = (o.type === 'sawtooth' ? 0.012 : 0.02) * (1 - i * 0.08)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(peak, t + 2.2)
        g.gain.setValueAtTime(peak, t + dur - 1.2)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.8)
        const pan = ctx.createStereoPanner()
        pan.pan.value = (i / (chord.notes.length - 1) - 0.5) * 0.8 + cents / 60
        o.connect(g).connect(pan).connect(tone)
        o.start(t)
        o.stop(t + dur + 2)
      })
    })
  }

  function bass(chord, t, dur) {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = hz(chord.root)
    const g = ctx.createGain()
    const level = scene === 'site' ? 0.09 : 0.06
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(level, t + 0.6)
    g.gain.setValueAtTime(level, t + dur - 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4)
    o.connect(g).connect(comp)
    o.start(t)
    o.stop(t + dur + 0.5)
  }

  function sparkle(t) {
    const m = SPARKLE[Math.floor(rand() * SPARKLE.length)]
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = hz(m)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.035 + intensity * 0.03, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    const pan = ctx.createStereoPanner()
    pan.pan.value = rand() * 1.6 - 0.8
    o.connect(g).connect(pan).connect(tone)
    o.start(t)
    o.stop(t + 1.7)
  }

  function pulse(t, accent) {
    // A soft, low heartbeat: a sine dropping in pitch, no click.
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(90, t)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.25)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(accent ? 0.16 : 0.09, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
    o.connect(g).connect(comp)
    o.start(t)
    o.stop(t + 0.4)
  }

  function scheduleBar(t) {
    const chordIndex = Math.floor(bar / BARS_PER_CHORD) % CHORDS.length
    const chord = CHORDS[chordIndex]
    if (bar % BARS_PER_CHORD === 0) {
      pad(chord, t, BAR * BARS_PER_CHORD)
      bass(chord, t, BAR * BARS_PER_CHORD)
    }
    // Eighth-note grid, sparse: more notes while charging, a few more on site.
    const chance = 0.16 + intensity * 0.45 + (scene === 'site' ? 0.06 : 0)
    for (let i = 0; i < 8; i++) if (rand() < chance) sparkle(t + i * (BEAT / 2))
    if (scene === 'site') {
      pulse(t, true)
      pulse(t + BEAT * 0.5, false)
      pulse(t + BEAT * 2, true)
    }
    bar++
  }

  function tick() {
    const ahead = ctx.currentTime + LOOKAHEAD
    while (nextBar < ahead) {
      scheduleBar(nextBar)
      nextBar += BAR
    }
  }

  return {
    start() {
      if (running) return
      running = true
      nextBar = ctx.currentTime + 0.1
      tick()
      timer = setInterval(tick, TICK_MS)
    },
    stop() {
      running = false
      clearInterval(timer)
    },
    // Fade the whole score in or out.
    setVolume(v, seconds = 2.5) {
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setValueAtTime(out.gain.value, t)
      out.gain.linearRampToValueAtTime(v, t + seconds)
    },
    // 0..1: the gate's charge. Opens the filter and adds sparkle.
    setIntensity(v) {
      intensity = Math.max(0, Math.min(1, v))
      tone.frequency.setTargetAtTime(1400 + intensity * 5200, ctx.currentTime, 0.12)
    },
    // A brief brightening as a chapter title passes the camera.
    swell() {
      const t = ctx.currentTime
      const base = 1400 + intensity * 5200
      tone.frequency.cancelScheduledValues(t)
      tone.frequency.setValueAtTime(tone.frequency.value, t)
      tone.frequency.linearRampToValueAtTime(4800, t + 0.35)
      tone.frequency.setTargetAtTime(scene === 'site' ? 2200 : base, t + 0.5, 0.9)
    },
    setScene(next) {
      if (next === scene) return
      scene = next
      if (next === 'site') {
        // The hand-off: a bright swell that settles as the pulse comes in.
        const t = ctx.currentTime
        tone.frequency.cancelScheduledValues(t)
        tone.frequency.setValueAtTime(6500, t)
        tone.frequency.setTargetAtTime(2200, t + 0.4, 1.2)
        intensity = 0
      }
    },
  }
}
