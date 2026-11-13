import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import { Environment, Lightformer, RoundedBox } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import * as THREE from 'three'
import { sceneCanvasProps } from '../lib/r3f'
import { SceneKit, useSceneFrameloop } from './SceneKit'
import { blip } from '../lib/sound'
import { meta } from '../data'

const CARD_W = 1.6
const CARD_H = 2.25
const STRAP_SEGMENTS = 40
const STRAP_HALF_WIDTH = 0.16

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// The badge face is drawn in code, so it always carries the real name/role.
function drawFront(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#0d0f16')
  g.addColorStop(1, '#0b1233')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Fine grid for texture.
  ctx.strokeStyle = 'rgba(123,147,255,0.08)'
  ctx.lineWidth = 2
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }

  // Lime access strip.
  ctx.fillStyle = '#ccff00'
  ctx.fillRect(0, 150, W, 92)
  ctx.fillStyle = '#0b0b0f'
  ctx.font = '600 38px "JetBrains Mono", monospace'
  ctx.textBaseline = 'middle'
  ctx.fillText('ACCESS · ALL CREDENTIALS', 56, 197)

  // Emblem.
  ctx.fillStyle = '#3d63ff'
  ctx.beginPath()
  ctx.arc(W - 150, 420, 86, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 92px "Inter Tight", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(meta.firstName[0] || 'K', W - 150, 426)
  ctx.textAlign = 'left'

  // Name.
  ctx.fillStyle = '#f2efe9'
  ctx.font = '900 150px "Inter Tight", system-ui, sans-serif'
  ctx.fillText(meta.firstName, 56, 640)
  ctx.fillText(meta.lastName, 56, 790)

  ctx.fillStyle = '#7b93ff'
  ctx.font = 'italic 400 76px "Instrument Serif", Georgia, serif'
  ctx.fillText(meta.role, 56, 905)

  // Divider + details.
  ctx.fillStyle = 'rgba(242,239,233,0.16)'
  ctx.fillRect(56, 990, W - 112, 2)
  ctx.font = '500 34px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(242,239,233,0.6)'
  ctx.fillText('ID  0261-108', 56, 1060)
  ctx.fillText(`LOC ${meta.location.toUpperCase()}`, 56, 1112)
  ctx.fillStyle = '#ccff00'
  ctx.fillText(`● ${meta.available.toUpperCase()}`, 56, 1164)

  // Deterministic barcode.
  let x = 56
  let i = 0
  while (x < W - 56) {
    const w = 4 + ((i * 37) % 4) * 4
    if (i % 3 !== 1) {
      ctx.fillStyle = '#f2efe9'
      ctx.fillRect(x, 1240, w, 110)
    }
    x += w + 6
    i++
  }
}

function drawBack(ctx, W, H) {
  ctx.fillStyle = '#3d63ff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(204,255,0,0.55)'
  ctx.lineWidth = 10
  for (let k = -H; k < W + H; k += 70) {
    ctx.beginPath()
    ctx.moveTo(k, 0)
    ctx.lineTo(k + H, H)
    ctx.stroke()
  }
  ctx.fillStyle = '#0b0b0f'
  roundRect(ctx, W / 2 - 300, H / 2 - 110, 600, 220, 40)
  ctx.fill()
  ctx.fillStyle = '#ccff00'
  ctx.font = '900 140px "Inter Tight", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${meta.firstName}.`, W / 2, H / 2 + 6)
}

function drawStrap(ctx, W, H) {
  ctx.fillStyle = '#3d63ff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ccff00'
  ctx.fillRect(W / 2 - 4, 0, 8, H)
  ctx.save()
  ctx.translate(W / 2, H / 2)
  ctx.rotate(Math.PI / 2)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 30px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(meta.firstName, -H / 4, -W / 4)
  ctx.fillText(meta.firstName, H / 4, W / 4)
  ctx.restore()
}

function useCanvasTexture(width, height, draw, repeat) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
    }
    return t
  }, [width, height, repeat])

  useEffect(() => {
    let alive = true
    const paint = () => {
      if (!alive) return
      draw(texture.image.getContext('2d'), width, height)
      texture.needsUpdate = true
    }
    paint()
    // Redraw once the web fonts are in, so the face is not stuck in a fallback font.
    document.fonts?.ready.then(paint)
    return () => {
      alive = false
      texture.dispose()
    }
  }, [texture, draw, width, height])

  return texture
}

function Badge({ reduced, onOpen }) {
  const fixed = useRef()
  const j1 = useRef()
  const j2 = useRef()
  const j3 = useRef()
  const card = useRef()
  const strap = useRef()
  const [dragged, setDragged] = useState(null)
  // A press that ends without real movement is a click: it opens the profile.
  const press = useRef(null)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  const front = useCanvasTexture(1024, 1440, drawFront)
  const back = useCanvasTexture(1024, 1440, drawBack)
  const strapTex = useCanvasTexture(64, 512, drawStrap, true)

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3, card, [[0, 0, 0], [0, CARD_H / 2 + 0.32, 0]])

  const scratch = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()])
    curve.curveType = 'chordal'
    return {
      curve,
      vec: new THREE.Vector3(),
      anchorPos: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      ang: new THREE.Vector3(),
      rot: new THREE.Vector3(),
      pts: Array.from({ length: STRAP_SEGMENTS + 1 }, () => new THREE.Vector3()),
      tangent: new THREE.Vector3(),
      side: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
    }
  }, [])

  // A flat ribbon whose vertices are rewritten every frame along the rope curve.
  const strapGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const verts = (STRAP_SEGMENTS + 1) * 2
    const pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3)
    pos.setUsage(THREE.DynamicDrawUsage)
    const uv = new Float32Array(verts * 2)
    const index = []
    for (let i = 0; i <= STRAP_SEGMENTS; i++) {
      const v = (i / STRAP_SEGMENTS) * 4
      uv.set([0, v, 1, v], i * 4)
      if (i < STRAP_SEGMENTS) {
        const a = i * 2
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    g.setAttribute('position', pos)
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(index)
    return g
  }, [])
  useEffect(() => () => strapGeometry.dispose(), [strapGeometry])

  useEffect(() => {
    const release = (e) => {
      setDragged(null)
      document.documentElement.classList.remove('is-dragging')
      const p = press.current
      press.current = null
      if (!p || !e || e.clientX === undefined) return
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (moved >= 6 || performance.now() - p.t >= 400) return
      let done = false
      let timer = 0
      const open = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        window.removeEventListener('click', swallow, true)
        onOpenRef.current?.()
      }
      const swallow = (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
        open()
      }
      window.addEventListener('click', swallow, true)
      // Some browsers send no click after a touch; open anyway.
      timer = setTimeout(open, 450)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
    }
  }, [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const { curve, vec, dir, ang, rot, pts, tangent, side, forward, anchorPos } = scratch
    if (!fixed.current || !j1.current || !j2.current || !j3.current || !card.current) return

    if (dragged) {
      // Project the pointer onto the badge's plane and pull the card there.
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera)
      dir.copy(vec).sub(state.camera.position).normalize()
      vec.add(dir.multiplyScalar(state.camera.position.length()))
      ;[card, j1, j2, j3, fixed].forEach((r) => r.current?.wakeUp())
      vec.sub(dragged)
      // Never pull the card further than the strap can reach: overstretching
      // it flings the card out of the canvas on release.
      anchorPos.copy(fixed.current.translation())
      const reach = 4.6
      if (vec.distanceTo(anchorPos) > reach) vec.sub(anchorPos).setLength(reach).add(anchorPos)
      card.current.setNextKinematicTranslation({ x: vec.x, y: vec.y, z: vec.z })
    }

    // Smooth the two middle joints so the strap does not jitter when overpulled.
    ;[j1, j2].forEach((r) => {
      const body = r.current
      if (!body.lerped) body.lerped = new THREE.Vector3().copy(body.translation())
      const d = Math.max(0.1, Math.min(1, body.lerped.distanceTo(body.translation())))
      body.lerped.lerp(body.translation(), dt * (10 + d * 40))
    })

    curve.points[0].copy(j3.current.translation())
    curve.points[1].copy(j2.current.lerped)
    curve.points[2].copy(j1.current.lerped)
    curve.points[3].copy(fixed.current.translation())

    const pos = strapGeometry.attributes.position
    for (let i = 0; i <= STRAP_SEGMENTS; i++) curve.getPoint(i / STRAP_SEGMENTS, pts[i])
    for (let i = 0; i <= STRAP_SEGMENTS; i++) {
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(STRAP_SEGMENTS, i + 1)]
      tangent.copy(b).sub(a).normalize()
      side.crossVectors(tangent, forward).normalize().multiplyScalar(STRAP_HALF_WIDTH)
      const p = pts[i]
      pos.setXYZ(i * 2, p.x + side.x, p.y + side.y, p.z + side.z)
      pos.setXYZ(i * 2 + 1, p.x - side.x, p.y - side.y, p.z - side.z)
    }
    pos.needsUpdate = true

    // Ease the card's spin back so its face keeps turning toward the viewer.
    ang.copy(card.current.angvel())
    rot.copy(card.current.rotation())
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z })
  })

  const segment = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 2, linearDamping: 2 }

  const onDown = (e) => {
    if (reduced || !card.current) return
    e.stopPropagation()
    if (e.pointerType === 'touch') {
      // Touch never drags (the page must still scroll): a tap swings it and opens the profile.
      const m = card.current.mass()
      card.current.applyImpulse({ x: (e.point.x > card.current.translation().x ? -1 : 1) * m * 3, y: m * 1.2, z: 0 }, true)
      blip({ freq: 760, dur: 0.06 })
      press.current = { x: e.clientX, y: e.clientY, t: performance.now() }
      return
    }
    if (e.button !== 0) return
    try {
      // Can throw for a pointer the browser no longer considers active; the
      // window pointerup listener still ends the drag either way.
      e.target.setPointerCapture?.(e.pointerId)
    } catch {
      /* drag still works without capture */
    }
    press.current = { x: e.clientX, y: e.clientY, t: performance.now() }
    document.documentElement.classList.add('is-dragging')
    setDragged(new THREE.Vector3().copy(e.point).sub(card.current.translation()))
    blip({ freq: 900, dur: 0.05 })
  }

  return (
    <>
      <group position={[0, 4.2, 0]}>
        <RigidBody ref={fixed} {...segment} type="fixed" />
        <RigidBody ref={j1} position={reduced ? [0, -1, 0] : [0.5, 0, 0]} {...segment}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={j2} position={reduced ? [0, -2, 0] : [1, 0, 0]} {...segment}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={j3} position={reduced ? [0, -3, 0] : [1.5, 0, 0]} {...segment}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody ref={card} position={reduced ? [0, -3 - (CARD_H / 2 + 0.32), 0] : [2, 0, 0]} {...segment} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[CARD_W / 2, CARD_H / 2, 0.03]} />
          <group onPointerDown={onDown}>
            <RoundedBox args={[CARD_W, CARD_H, 0.05]} radius={0.07} smoothness={4}>
              <meshPhysicalMaterial color="#0d0f16" clearcoat={1} clearcoatRoughness={0.2} roughness={0.35} />
            </RoundedBox>
            <mesh position={[0, 0, 0.026]}>
              <planeGeometry args={[CARD_W - 0.08, CARD_H - 0.08]} />
              <meshPhysicalMaterial map={front} clearcoat={1} clearcoatRoughness={0.15} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0, -0.026]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[CARD_W - 0.08, CARD_H - 0.08]} />
              <meshPhysicalMaterial map={back} clearcoat={1} clearcoatRoughness={0.15} roughness={0.45} />
            </mesh>
            {/* Metal clip and ring the strap threads through. */}
            <RoundedBox args={[0.38, 0.18, 0.09]} radius={0.04} position={[0, CARD_H / 2 + 0.05, 0]}>
              <meshStandardMaterial color="#c9ccd6" metalness={1} roughness={0.25} />
            </RoundedBox>
            <mesh position={[0, CARD_H / 2 + 0.24, 0]}>
              <torusGeometry args={[0.09, 0.025, 12, 32]} />
              <meshStandardMaterial color="#c9ccd6" metalness={1} roughness={0.25} />
            </mesh>
          </group>
        </RigidBody>
      </group>
      <mesh ref={strap} geometry={strapGeometry} frustumCulled={false}>
        <meshStandardMaterial map={strapTex} side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
    </>
  )
}

export default function LanyardScene({ onOpen }) {
  const reduced = useReducedMotion()
  const frameloop = useSceneFrameloop()
  return (
    <Canvas
      className="badge__canvas"
      dpr={[1, 1.5]}
      frameloop={frameloop}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 13], fov: 25 }}
      {...sceneCanvasProps()}
    >
      <SceneKit maxDpr={1.5} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 4, 6]} intensity={1.6} />
      <pointLight position={[-4, 1, 4]} intensity={60} distance={20} color="#3d63ff" />
      <pointLight position={[4, -1, 3]} intensity={40} distance={20} color="#ccff00" />
      <Physics gravity={[0, -40, 0]} timeStep={1 / 60} interpolate paused={!!reduced}>
        <Badge reduced={reduced} onOpen={onOpen} />
      </Physics>
      {/* Local environment so the clearcoat and metal clip have something to reflect. */}
      <Environment resolution={128} frames={1}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer form="rect" intensity={3} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 2, 1]} />
          <Lightformer form="ring" color="#3d63ff" intensity={6} rotation-y={Math.PI / 2} position={[-5, 0, -1]} scale={4} />
          <Lightformer form="ring" color="#ccff00" intensity={4} rotation-y={-Math.PI / 2} position={[6, 1, 0]} scale={5} />
        </group>
      </Environment>
    </Canvas>
  )
}
