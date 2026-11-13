import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'
import { Scramble } from './Bits'
import { FlipText } from './Reveal'
import { timeline } from '../data'
import './timeline.css'

// Viewport height (0–1) where the rail's glowing tip rides; a node lights as it crosses it.
const TIP = 0.32

function Card({ row, i, total, progress }) {
  // A card only recedes once the NEXT one starts covering it, and the last
  // card never recedes — otherwise whatever you are reading looks washed out.
  const covered = (i + 1) / total
  const isLast = i === total - 1

  const scale = useTransform(
    progress,
    [covered, Math.min(1, covered + 0.3)],
    [1, isLast ? 1 : 0.93]
  )
  const veil = useTransform(
    progress,
    [covered, Math.min(1, covered + 0.3)],
    [0, isLast ? 0 : 0.6]
  )

  return (
    <motion.article
      className="stack__card"
      style={{ top: `calc(15vh + ${i * 2.4}rem)`, scale, zIndex: i + 1 }}
    >
      <div className="stack__inner">
        <motion.div className="stack__veil" style={{ opacity: veil }} />
        <div className="stack__label" data-status={row.status}>
          {row.label}
        </div>
        <div>
          <h3>{row.title}</h3>
          <p>{row.body}</p>
        </div>
        <div className="stack__index">
          {String(i + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </div>
      </div>
    </motion.article>
  )
}

// Zero-height marker in the flow right before its card, so it sits level with
// the card's resting position without measuring anything (cards are sticky).
function Node({ i, current, onLit }) {
  const dotRef = useRef(null)
  const [lit, setLit] = useState(false)
  const { scrollYProgress } = useScroll({ target: dotRef, offset: [`center ${TIP + 0.02}`, `center ${TIP}`] })

  useMotionValueEvent(scrollYProgress, 'change', (v) => setLit(v > 0.5))
  useEffect(() => onLit(i, lit), [i, lit, onLit])

  return (
    <div className={`nowline__node${lit ? ' is-lit' : ''}${current ? ' is-current' : ''}`} aria-hidden="true">
      <span className="nowline__dot" ref={dotRef}>
        <i className="nowline__pulse" />
      </span>
    </div>
  )
}

export default function Timeline() {
  const ref = useRef(null)
  const lineRef = useRef(null)
  const litRef = useRef([])
  const [current, setCurrent] = useState(-1)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  // The fill runs from the rail's top to a fixed point on screen, so the tip holds still while it draws.
  const { scrollYProgress: drawn } = useScroll({ target: lineRef, offset: [`start ${TIP}`, `end ${TIP}`] })
  const lineHeight = useMotionValue(0)
  const tipY = useTransform([drawn, lineHeight], ([p, h]) => p * h)
  const tipOpacity = useTransform(drawn, [0, 0.01, 0.99, 1], [0, 1, 1, 0])

  useEffect(() => {
    const el = lineRef.current
    if (!el) return undefined
    const measure = () => lineHeight.set(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [lineHeight])

  const onLit = useCallback((i, on) => {
    litRef.current[i] = on
    setCurrent(litRef.current.lastIndexOf(true))
  }, [])

  return (
    <section className="section stack has-rail" id="now" ref={ref}>
      {/* First child on purpose: .stack__card:last-child must stay the last card. */}
      <div className="nowline" ref={lineRef} aria-hidden="true">
        <div className="nowline__track" />
        <motion.div className="nowline__glow" style={{ scaleY: drawn }} />
        <motion.div className="nowline__fill" style={{ scaleY: drawn }} />
        <motion.div className="nowline__tip" style={{ y: tipY, opacity: tipOpacity }} />
      </div>
      <div className="label">
        <Scramble text="Now / Next" />
      </div>
      <h2 className="stack__heading">
        <FlipText text="Where I’m" />{' '}
        <em>
          <FlipText text="headed" delay={0.3} />
        </em>
      </h2>
      {timeline.map((row, i) => (
        <Fragment key={row.title}>
          <Node i={i} current={i === current} onLit={onLit} />
          <Card row={row} i={i} total={timeline.length} progress={scrollYProgress} />
        </Fragment>
      ))}
    </section>
  )
}
