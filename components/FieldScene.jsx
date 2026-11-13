import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'
import { sceneCanvasProps } from '../lib/r3f'
import { SceneKit, useSceneFrameloop } from './SceneKit'

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Domain-warped fbm — the warp is what stops it reading as generic noise.
const fragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uVel;
  uniform vec2  uMouse;
  uniform vec2  uRes;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // gl_FragCoord is always correct; ScreenQuad's uv attribute is not
    // something to rely on, and a zeroed uv silently flattens the whole field.
    vec2 uv = gl_FragCoord.xy / uRes;
    vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.4;

    float t = uTime * 0.06;
    // Scroll speed shears the field, so fast scrolling visibly disturbs it.
    p.y += uVel * 0.55;

    vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + 0.15 * t),
                  fbm(p + 3.4 * q + vec2(8.3, 2.8) + 0.13 * t));
    float f = fbm(p + 3.6 * r);
    // fbm clusters around 0.5; stretch it or the whole field reads as flat black.
    f = smoothstep(0.28, 0.72, f);

    vec3 base   = vec3(0.035, 0.032, 0.045);
    vec3 deep   = vec3(0.105, 0.165, 0.480);
    vec3 accent = vec3(0.800, 1.000, 0.000);

    vec3 col = mix(base, deep, f);
    col = mix(col, accent, pow(smoothstep(0.55, 0.95, f), 1.6) * 0.6);

    // Pointer bloom
    float d = length(p - uMouse * vec2(uRes.x / uRes.y, 1.0) * 1.2);
    col += vec3(0.24, 0.39, 1.0) * 0.2 * exp(-d * 2.0);
    // White-hot cores where the warp peaks.
    col = mix(col, vec3(1.0), pow(smoothstep(0.9, 1.0, f), 3.0) * 0.22);

    // Filament highlights along the warp ridges
    float ridge = smoothstep(0.46, 0.50, f) - smoothstep(0.54, 0.62, f);
    col += accent * ridge * 0.45;

    col *= 1.0 - 0.72 * length(uv - 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`

function Field() {
  const mat = useRef()
  const { size, pointer } = useThree()
  const vel = useRef(0)
  const last = useRef(0)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uVel: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uRes: { value: new THREE.Vector2(1, 1) },
    }),
    []
  )

  useFrame((state, delta) => {
    const d = Math.min(delta, 0.05)
    const y = window.scrollY
    const raw = (y - last.current) / Math.max(d, 0.001)
    last.current = y
    // Heavy damping keeps the shear from snapping on every wheel tick.
    vel.current += (THREE.MathUtils.clamp(raw / 3000, -1.2, 1.2) - vel.current) * 0.08

    if (!mat.current) return
    mat.current.uniforms.uTime.value += d
    mat.current.uniforms.uVel.value = vel.current
    mat.current.uniforms.uMouse.value.set(pointer.x, pointer.y)
    mat.current.uniforms.uRes.value.set(state.size.width * state.viewport.dpr, state.size.height * state.viewport.dpr)
  })

  return (
    <ScreenQuad>
      <shaderMaterial
        ref={mat}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </ScreenQuad>
  )
}

export default function FieldScene() {
  const frameloop = useSceneFrameloop()
  return (
    <Canvas
      className="field__canvas"
      // A soft, blurry field: rendering it at a fraction of the screen's
      // resolution and letting the browser scale it up is visually identical
      // and many times cheaper than shading every retina pixel.
      dpr={0.6}
      frameloop={frameloop}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      {...sceneCanvasProps()}
    >
      <SceneKit maxDpr={0.6} minDpr={0.45} />
      <Field />
    </Canvas>
  )
}
