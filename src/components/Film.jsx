import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { story } from '../data'
import { scrollToY } from '../lib/scroll'
import { blip } from '../lib/sound'
import './film.css'

const FPS = 24

// A timecode for the scroll position: the page reads as a reel being played.
function timecode(y) {
  const frames = Math.floor(y / 6)
  const f = frames % FPS
  const s = Math.floor(frames / FPS)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(f)}`
}

/**
 * The film's controls: a scrubber down the right edge with a mark for each
 * act, the playhead where the visitor is, and a running timecode. Clicking a
 * mark cuts straight to that act. Measured from the .cut blocks in the page,
 * so it follows whatever story data.js tells.
 */
export default function Film() {
  const [marks, setMarks] = useState([])
  const [active, setActive] = useState(-1)
  const head = useRef(null)
  const code = useRef(null)

  useEffect(() => {
    const measure = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      setMarks(
        [...document.querySelectorAll('.cut')].map((el) => {
          const top = el.getBoundingClientRect().top + window.scrollY
          return { top, at: Math.min(1, top / max) }
        })
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // The playhead and timecode are written straight to the DOM on scroll, so
  // scrolling never re-renders React; only a change of act does.
  useEffect(() => {
    let raf = 0
    let lastActive = -1
    const update = () => {
      raf = 0
      const y = window.scrollY
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      if (head.current) head.current.style.transform = `scaleY(${Math.min(1, y / max)})`
      if (code.current) code.current.textContent = timecode(y)
      const mid = y + window.innerHeight * 0.5
      let a = -1
      marks.forEach((m, i) => {
        if (mid >= m.top) a = i
      })
      if (a !== lastActive) {
        lastActive = a
        setActive(a)
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [marks])

  // Land just as the title sequence is about to fill the screen.
  const jump = (i) => {
    const m = marks[i]
    if (!m) return
    blip({ freq: 520 + i * 90, dur: 0.07 })
    scrollToY(m.top + window.innerHeight * 0.35, { duration: 1.4 })
  }

  return (
    <motion.nav
      className="film"
      aria-label="Story chapters"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="film__track">
        <div className="film__fill" ref={head} />
        {marks.map((m, i) => (
          <button
            type="button"
            key={story[i]?.act ?? i}
            className={`film__mark${i === active ? ' is-active' : ''}${i < active ? ' is-past' : ''}`}
            style={{ top: `${m.at * 100}%` }}
            onClick={() => jump(i)}
            aria-label={`Act ${story[i]?.act}: ${story[i]?.title.join(' ')}`}
            aria-current={i === active ? 'step' : undefined}
            data-cursor={story[i] ? `Act ${story[i].act}` : ''}
          >
            <span className="film__tick" aria-hidden="true" />
            <span className="film__label" aria-hidden="true">
              {story[i]?.act} <em>{story[i]?.title[1]}</em>
            </span>
          </button>
        ))}
      </div>
      <span className="film__code" ref={code} aria-hidden="true">
        00:00:00:00
      </span>
    </motion.nav>
  )
}
