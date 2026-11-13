import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import ErrorBoundary from './ErrorBoundary'
import { CUT, cut, letterbox, ramp, useActiveCut } from '../lib/cutfx'
import { hasWebGL2, isLowPower } from '../lib/webgl'
import './cutfx.css'

// The act cuts' visual effects: one fixed, transparent WebGL layer over the
// page that dresses whichever cut is playing, driven entirely by the live
// state the cut publishes (src/lib/cutfx.js). Three draw calls, all additive:
//
// 1. a hyperspace tunnel of light streaks rushing at the lens: a slow drift
//    while the title arrives and holds, light speed as it flies through the
//    lens, decaying as the next scene opens;
// 2. embers drifting through the frame while the title holds;
// 3. a shockwave ring fired as the title passes the lens, with the whoosh.
//
// Every streak and ember moves in its vertex shader from a handful of
// uniforms; the CPU only advances a clock and a travel distance. The effects
// are masked to the cut's frame (they push in with it, and leave with it)
// and kept out of the letterbox bars. Each act grades them differently
// within the brand's lime, cobalt and white. The canvas renders only while a
// cut is playing and is hidden otherwise.

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const DRIFT = 4 // tunnel speed (world units/s) while the title arrives and holds
const LIGHT = 110 // and at light speed, as it flies through the lens
const SHOCK_LIFE = 1.4 // seconds the shockwave is drawn after the pass

// Brand colours as display values: the shaders write straight to the canvas
// with no colour management, so these land on screen as the CSS hex does.
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Per act: tunnel primary and secondary (with the share of secondary
// streaks), embers, the shockwave's inner and outer edge, and overall gain.
const GRADES = [
  // I · The Spark (the mind, midnight): cold cobalt, a few lime sparks.
  { a: '#7b93ff', b: '#ccff00', mix: 0.14, e: '#ccff00', ringIn: '#3d63ff', ringOut: '#ccff00', gain: 1.05 },
  // II · The Craft (the studio, late night): lime light, white highlights.
  { a: '#ccff00', b: '#f4f3ee', mix: 0.3, e: '#f4f3ee', ringIn: '#ccff00', ringOut: '#7b93ff', gain: 0.82 },
  // III · The Work (the workshop, day): daylight white over cobalt.
  { a: '#f4f3ee', b: '#3d63ff', mix: 0.42, e: '#ccff00', ringIn: '#7b93ff', ringOut: '#f4f3ee', gain: 0.9 },
  // IV · The Proof (the vault): deep cobalt steel.
  { a: '#3d63ff', b: '#7b93ff', mix: 0.45, e: '#f4f3ee', ringIn: '#3d63ff', ringOut: '#f4f3ee', gain: 1.2 },
  // V · What's Next (the horizon, dawn): lime breaking into white.
  { a: '#e4ff7a', b: '#7b93ff', mix: 0.22, e: '#ccff00', ringIn: '#ccff00', ringOut: '#f4f3ee', gain: 0.95 },
].map((g) => ({ ...g, a: rgb(g.a), b: rgb(g.b), e: rgb(g.e), ringIn: rgb(g.ringIn), ringOut: rgb(g.ringOut) }))

// Shared by every shader. Everything is placed in CSS pixels of the viewport
// (y down) and converted to clip space directly; no camera is involved, so
// the vanishing point can simply follow the cut's frame.
const COMMON = /* glsl */ `
  uniform vec2 uSize;
  uniform float uDpr;
  uniform vec2 uCenter;
  uniform vec4 uFrame;
  uniform float uRadius;
  uniform float uBar;

  vec4 clipFrom(vec2 px) {
    return vec4(px.x / uSize.x * 2.0 - 1.0, 1.0 - px.y / uSize.y * 2.0, 0.0, 1.0);
  }

  // 1 inside the cut's (scaled, rounded) frame and between the letterbox
  // bars, 0 outside: the effects belong to the film, never to the page.
  float frameMask(vec2 px) {
    vec2 q = abs(px - uFrame.xy) - uFrame.zw + uRadius;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
    float inside = 1.0 - smoothstep(-14.0, 0.0, d);
    float bars = smoothstep(uBar - 1.0, uBar + 7.0, px.y) * smoothstep(uBar - 1.0, uBar + 7.0, uSize.y - px.y);
    return inside * mix(1.0, bars, step(0.5, uBar));
  }
`

// --- 1. Light tunnel ---------------------------------------------------------
// Each streak lives on a cylinder around the view axis and slides along it
// toward the lens. Head and tail are projected separately, so a fast streak
// is long (motion blur) and every streak points at the vanishing point.

const TUNNEL_VERTEX = /* glsl */ `
  ${COMMON}
  attribute vec4 aSeed; // angle, radius, depth phase, brightness
  uniform float uTime;
  uniform float uTravel;
  uniform float uLen;
  uniform float uFocal;
  uniform float uTunnel;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uMixB;
  varying vec2 vPx;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vA;

  const float DEPTH = 64.0;
  const float NEAR = 0.35;

  void main() {
    float ang = aSeed.x * 6.28318530718;
    vec2 dir = vec2(cos(ang), sin(ang));
    float radius = mix(0.8, 3.6, aSeed.y);
    float pace = 0.7 + 0.6 * fract(aSeed.w * 7.31);
    // Distance ahead of the lens, wrapping to the far end once it passes.
    float ahead = fract(aSeed.z - uTravel * pace / DEPTH) * DEPTH;
    float zh = NEAR + ahead;
    float zt = zh + uLen * pace;
    float rh = uFocal * radius / zh;
    // At least a couple of pixels long, so a slow streak reads as a dash.
    float rt = min(uFocal * radius / zt, rh - 2.0);

    // Thicker as it nears the lens; never thinner than a device pixel.
    float hw = max(mix(0.5, 1.7, smoothstep(18.0, 1.0, zh)), 0.6 / uDpr);
    float reach = hw + 1.5;
    vec2 px = uCenter + dir * mix(rt, rh, position.x) + vec2(-dir.y, dir.x) * (position.y * reach);

    vPx = px;
    vUv = vec2(position.x, position.y * reach / hw);
    // Born faint at the far end, gone just before it reaches the lens.
    float fade = smoothstep(DEPTH, DEPTH * 0.45, ahead) * smoothstep(0.0, 1.0, ahead);
    float twinkle = 0.8 + 0.2 * sin(uTime * (1.2 + 2.4 * aSeed.w) + aSeed.x * 40.0);
    vA = uTunnel * fade * twinkle * (0.3 + 0.7 * aSeed.w);
    vCol = mix(uColA, uColB, step(1.0 - uMixB, fract(aSeed.w * 13.7 + aSeed.y * 5.3)));
    gl_Position = clipFrom(px);
  }
`

const TUNNEL_FRAGMENT = /* glsl */ `
  ${COMMON}
  uniform vec2 uCalmBox;
  uniform float uCalm;
  varying vec2 vPx;
  varying vec2 vUv;
  varying vec3 vCol;
  varying float vA;

  void main() {
    float s = vUv.y;
    float across = exp(-s * s * 2.0);
    // Brightest at the head, trailing off along the tail.
    float along = vUv.x * vUv.x;
    // A calmer, dimmer centre where the title sits, so it stays readable.
    float calm = mix(1.0 - uCalm, 1.0, smoothstep(0.4, 1.25, length((vPx - uCenter) / uCalmBox)));
    float a = vA * across * along * calm * frameMask(vPx);
    vec3 col = mix(vCol, vec3(1.0), exp(-s * s * 8.0) * 0.6 * vUv.x) * a;
    // Premultiplied, with alpha at least every channel: well-defined
    // compositing over the page, and nearly additive on its dark ground.
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  }
`

// --- 2. Embers ----------------------------------------------------------------
// Sparks hanging in the air of the frame: rising, swaying, flickering, and
// creeping toward the lens with the tunnel, so light speed blows them past.

const EMBER_VERTEX = /* glsl */ `
  ${COMMON}
  attribute float aW; // size, brightness, colour pick
  uniform float uTime;
  uniform float uTravel;
  uniform float uFocal;
  uniform float uEmbers;
  uniform vec3 uColA;
  uniform vec3 uColE;
  varying float vA;
  varying float vSoft;
  varying vec3 vCol;

  void main() {
    vec3 s = position; // three seeds in 0..1
    float z = 1.8 + fract(s.z - uTravel * 0.0045) * 11.2;
    // Spread to fill the view at the far end; nearer ones spill past it.
    vec2 extent = uSize * 0.5 * 13.0 / uFocal;
    vec2 w = (s.xy * 2.0 - 1.0) * extent;
    w.y = mod(w.y + extent.y + uTime * (0.1 + 0.16 * aW), 2.0 * extent.y) - extent.y;
    w.x += sin(uTime * (0.35 + 0.5 * aW) + s.x * 31.0) * 0.14;
    vec2 px = uCenter + uFocal * vec2(w.x, -w.y) / z;

    float size = (0.045 + 0.085 * aW * aW) * uFocal / z;
    float flicker = 0.62 + 0.38 * sin(uTime * (1.7 + 4.0 * aW) + s.y * 57.0);
    float depth = smoothstep(13.0, 10.0, z) * smoothstep(1.8, 2.8, z);
    // Big out-of-focus sparks spread the same light thinner, like bokeh.
    float spread = pow(2.5 / max(size, 2.5), 0.8);
    vA = uEmbers * flicker * depth * (0.35 + 0.65 * aW) * spread * frameMask(px);
    vSoft = smoothstep(5.0, 2.0, z);
    vCol = mix(uColE, uColA, step(0.72, fract(aW * 9.13)));
    gl_PointSize = clamp(size, 1.5, 44.0) * uDpr + 2.0;
    gl_Position = clipFrom(px);
  }
`

const EMBER_FRAGMENT = /* glsl */ `
  varying float vA;
  varying float vSoft;
  varying vec3 vCol;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    float shape = mix(exp(-d2 * 6.0), exp(-d2 * 2.5) * 0.75, vSoft);
    float a = shape * (1.0 - smoothstep(0.75, 1.0, d2)) * vA;
    vec3 col = mix(vCol, vec3(1.0), exp(-d2 * 16.0) * 0.55) * a;
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  }
`

// --- 3. Shockwave ------------------------------------------------------------
// A ring strip, built in screen space at whatever radius it has reached, so
// only the pixels near the ring are shaded (no full-screen pass). Two
// instances: the wave and a fainter echo just behind it.

const RING_VERTEX = /* glsl */ `
  ${COMMON}
  attribute vec2 aRing; // delay (s), scale
  uniform float uShock; // seconds since the pass
  uniform float uShockR;
  uniform float uRing;
  varying vec2 vPx;
  varying float vSide;
  varying float vA;

  void main() {
    float t = clamp((uShock - aRing.x) / 1.15, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    float r = e * uShockR * aRing.y;
    float thick = mix(4.0, 90.0, e) * aRing.y;
    float ang = position.x * 6.28318530718;
    // A touch wider than tall: shot through an anamorphic lens.
    vec2 px = uCenter + vec2(cos(ang) * 1.1, sin(ang)) * (r + position.y * thick);
    vPx = px;
    vSide = position.y;
    vA = uRing * (1.0 - t) * (1.0 - t) * step(aRing.x, uShock);
    gl_Position = clipFrom(px);
  }
`

const RING_FRAGMENT = /* glsl */ `
  ${COMMON}
  uniform vec3 uRingIn;
  uniform vec3 uRingOut;
  varying vec2 vPx;
  varying float vSide;
  varying float vA;

  void main() {
    float s = vSide;
    float body = exp(-s * s * 4.5);
    // Split edges, as if the lens could not quite focus every colour at once.
    vec3 col = mix(uRingIn, uRingOut, smoothstep(-0.7, 0.7, s));
    col = mix(col, vec3(1.0), exp(-s * s * 28.0) * 0.7);
    float a = vA * body * frameMask(vPx);
    col *= a;
    gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));
  }
`

// Deterministic scatter, so every visit sees the same tunnel.
const rnd = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

function tunnelGeometry(count) {
  const g = new THREE.InstancedBufferGeometry()
  // A unit quad: x runs along the streak (0 tail, 1 head), y across it.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3))
  g.setIndex([0, 1, 2, 2, 1, 3])
  const seed = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    seed[i * 4] = rnd(i, 1)
    seed[i * 4 + 1] = rnd(i, 2)
    seed[i * 4 + 2] = rnd(i, 3)
    seed[i * 4 + 3] = rnd(i, 4)
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4))
  g.instanceCount = count
  return g
}

function emberGeometry(count) {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const w = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rnd(i, 5)
    pos[i * 3 + 1] = rnd(i, 6)
    pos[i * 3 + 2] = rnd(i, 7)
    w[i] = rnd(i, 8)
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aW', new THREE.BufferAttribute(w, 1))
  return g
}

function ringGeometry(segments = 144) {
  const g = new THREE.InstancedBufferGeometry()
  const pos = new Float32Array((segments + 1) * 2 * 3)
  for (let i = 0; i <= segments; i++) {
    pos[i * 6] = i / segments
    pos[i * 6 + 1] = -1
    pos[i * 6 + 3] = i / segments
    pos[i * 6 + 4] = 1
  }
  const index = []
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(index)
  g.setAttribute('aRing', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 0.09, 0.82]), 2))
  g.instanceCount = 2
  return g
}

function makeUniforms() {
  const num = (value = 0) => ({ value })
  const vec2 = () => ({ value: new THREE.Vector2(1, 1) })
  const vec3 = () => ({ value: new THREE.Vector3(1, 1, 1) })
  return {
    uSize: vec2(),
    uDpr: num(1),
    uCenter: vec2(),
    uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
    uRadius: num(28),
    uBar: num(0),
    uTime: num(0),
    uTravel: num(0),
    uLen: num(1),
    uFocal: num(600),
    uTunnel: num(0),
    uCalm: num(0.85),
    uCalmBox: vec2(),
    uColA: vec3(),
    uColB: vec3(),
    uMixB: num(0.2),
    uEmbers: num(0),
    uColE: vec3(),
    uRing: num(0),
    uShock: num(10),
    uShockR: num(1000),
    uRingIn: vec3(),
    uRingOut: vec3(),
  }
}

function applyGrade(u, index) {
  const g = GRADES[Math.max(0, index) % GRADES.length]
  u.uColA.value.fromArray(g.a)
  u.uColB.value.fromArray(g.b)
  u.uMixB.value = g.mix
  u.uColE.value.fromArray(g.e)
  u.uRingIn.value.fromArray(g.ringIn)
  u.uRingOut.value.fromArray(g.ringOut)
  return g.gain
}

// Additive light: premultiplied output with ONE, ONE blending.
const additive = {
  transparent: true,
  depthTest: false,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  premultipliedAlpha: true,
}

function Effects({ lowPower, on }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const uniforms = useMemo(makeUniforms, [])
  const tunnel = useMemo(() => tunnelGeometry(lowPower ? 400 : 1200), [lowPower])
  const embers = useMemo(() => emberGeometry(lowPower ? 140 : 320), [lowPower])
  const ring = useMemo(() => ringGeometry(), [])
  useEffect(
    () => () => {
      tunnel.dispose()
      embers.dispose()
      ring.dispose()
    },
    [tunnel, embers, ring]
  )

  const tunnelMesh = useRef()
  const emberPoints = useRef()
  const ringMesh = useRef()
  const state = useRef({ travel: 0, vel: 0, grade: -1, gain: 1 })

  // Compile the three programs now, in the background, so the first cut
  // never waits on them.
  useEffect(() => {
    if (typeof gl.compileAsync === 'function') gl.compileAsync(scene, camera).catch(() => {})
  }, [gl, scene, camera])

  // Leave a cleared buffer behind when a cut ends, so the next one can never
  // open on a stale frame of this one.
  useEffect(() => {
    if (!on) gl.clear()
  }, [on, gl])

  useFrame((three, delta) => {
    const d = Math.min(delta, 1 / 30)
    const u = uniforms
    const m = state.current
    const { width: W, height: H } = three.size
    const live = cut.active >= 0
    const p = cut.p

    if (live && m.grade !== cut.active) {
      m.grade = cut.active
      m.gain = applyGrade(u, cut.active) * (cut.field ? 0.9 : 1)
    }

    // Nothing draws outside the pinned window of the cut.
    const env = live ? smooth(0.18, 0.34, p) * (1 - smooth(0.7, 0.82, p)) : 0

    // Scroll speed, smoothed; a stale reading (the visitor stopped) decays.
    const fresh = performance.now() - cut.at < 100
    m.vel += ((fresh ? Math.min(3, Math.abs(cut.velocity)) : 0) - m.vel) * (1 - Math.exp(-d * 6))

    // Light speed as the title flies through the lens; scrolling hard
    // through the cut adds a little on top.
    const pass = smooth(0.52, 0.65, p) * (1 - smooth(0.67, 0.82, p))
    const warp = Math.min(1, pass + Math.min(0.3, m.vel * 0.15) * (1 - pass))
    const speed = DRIFT + (LIGHT - DRIFT) * warp * warp
    m.travel += speed * d

    // The frame, as the DOM has it this frame: scrolled in, pushed in.
    const s = ramp(p, CUT.push)
    const h = cut.height || H
    const cy = cut.top + h / 2
    u.uSize.value.set(W, H)
    u.uDpr.value = three.viewport.dpr
    u.uCenter.value.set(W / 2, cy)
    u.uFrame.value.set(W / 2, cy, (W / 2) * s, (h / 2) * s)
    u.uRadius.value = 28 * s
    u.uBar.value = letterbox(W, H) * ramp(p, CUT.bars)
    u.uFocal.value = 0.36 * (W + H)

    u.uTime.value += d
    u.uTravel.value = m.travel
    u.uLen.value = 0.6 + speed * 0.2
    u.uTunnel.value = env * (0.55 + 0.8 * warp) * m.gain
    u.uCalm.value = 0.85 * (1 - 0.6 * pass)
    u.uCalmBox.value.set(0.46 * W, 0.17 * H)
    u.uEmbers.value = env * smooth(0.26, 0.38, p) * (1 - smooth(0.6, 0.72, p))

    const age = (performance.now() - cut.pass) / 1000
    u.uShock.value = age
    u.uRing.value = age < SHOCK_LIFE ? env : 0
    u.uShockR.value = 0.62 * Math.hypot(W, H)

    // Skip the draw calls entirely while an effect is dark.
    tunnelMesh.current.visible = u.uTunnel.value > 0.002
    emberPoints.current.visible = u.uEmbers.value > 0.002
    ringMesh.current.visible = u.uRing.value > 0.002
  })

  return (
    <>
      <mesh ref={tunnelMesh} geometry={tunnel} frustumCulled={false} renderOrder={0}>
        <shaderMaterial vertexShader={TUNNEL_VERTEX} fragmentShader={TUNNEL_FRAGMENT} uniforms={uniforms} {...additive} />
      </mesh>
      <points ref={emberPoints} geometry={embers} frustumCulled={false} renderOrder={1}>
        <shaderMaterial vertexShader={EMBER_VERTEX} fragmentShader={EMBER_FRAGMENT} uniforms={uniforms} {...additive} />
      </points>
      <mesh ref={ringMesh} geometry={ring} frustumCulled={false} renderOrder={2}>
        <shaderMaterial vertexShader={RING_VERTEX} fragmentShader={RING_FRAGMENT} uniforms={uniforms} {...additive} />
      </mesh>
    </>
  )
}

// Nothing here is interactive: no pointer listeners, no raycasting.
const noEvents = () => ({ enabled: false, priority: 0, handlers: {} })
// A fixed, full-screen canvas never moves, so it never needs re-measuring on
// scroll (the default measures its rect on every scroll, debounced).
const RESIZE = { scroll: false }
const GL = {
  alpha: true,
  antialias: false,
  premultipliedAlpha: true,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
}

export default function CutFX() {
  const reduced = useReducedMotion()
  const active = useActiveCut()
  const on = active >= 0
  const supported = useMemo(() => hasWebGL2(), [])
  const lowPower = useMemo(() => isLowPower(), [])
  const dpr = useMemo(() => (lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)), [lowPower])
  const [mounted, setMounted] = useState(false)

  // Create the context in an idle moment a little after entry (not while the
  // gate is still leaving), well before the first cut. A cut reached sooner
  // mounts it on the spot.
  useEffect(() => {
    if (reduced || !supported) return undefined
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200))
    const cancelIdle = window.cancelIdleCallback || clearTimeout
    let handle
    const start = setTimeout(() => {
      handle = idle(() => setMounted(true), { timeout: 3000 })
    }, 2200)
    return () => {
      clearTimeout(start)
      if (handle) cancelIdle(handle)
    }
  }, [reduced, supported])

  useEffect(() => {
    if (on) setMounted(true)
  }, [on])

  // Reduced motion: no fly-through effects at all.
  if (reduced || !supported || !(mounted || on)) return null

  return (
    <div className="cutfx" aria-hidden="true" style={{ visibility: on ? 'visible' : 'hidden' }}>
      <ErrorBoundary>
        <Canvas
          className="cutfx__canvas"
          dpr={dpr}
          frameloop={on ? 'always' : 'never'}
          gl={GL}
          events={noEvents}
          resize={RESIZE}
          flat
          linear
          style={{ pointerEvents: 'none' }}
        >
          <Effects lowPower={lowPower} on={on} />
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}
