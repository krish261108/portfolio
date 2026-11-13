import { lazy, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import Modal from './Modal'
import CertView from './CertView'
import ProfileView from './ProfileView'
import LazyScene from './LazyScene'
import { Scramble, Skew } from './Bits'
import { FlipText } from './Reveal'
import { blip, chime } from '../lib/sound'
import { certificateGroups, certificates } from '../data'
import './certs.css'
import './lanyard.css'

const LanyardScene = lazy(() => import('./LanyardScene'))

const EASE = [0.16, 1, 0.3, 1]
const RARITY = { legendary: 'Legendary', epic: 'Epic', rare: 'Rare' }
const XP = { legendary: 500, epic: 300, rare: 150 }

function initials(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function HoloCard({ cert, index, order, onUnlock, onOpen }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-12% 0px' })
  const reduced = useReducedMotion()
  const [state, setState] = useState('locked')
  const unlockRef = useRef(onUnlock)
  unlockRef.current = onUnlock

  useEffect(() => {
    if (!inView) return undefined
    if (reduced) {
      setState('unlocked')
      unlockRef.current(cert)
      return undefined
    }
    const base = 200 + order * 200
    const t1 = setTimeout(() => setState('unlocking'), base)
    const t2 = setTimeout(() => {
      setState('unlocked')
      unlockRef.current(cert)
      blip({ freq: 990 + index * 60, dur: 0.1, gain: 0.03, type: 'triangle' })
    }, base + 720)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [inView, index, order, reduced, cert])

  // Foil + tilt run off CSS variables written straight to the element, so a
  // mousemove never re-renders React.
  const onMove = (e) => {
    const el = ref.current
    if (!el || state !== 'unlocked') return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
    el.style.setProperty('--rx', `${(0.5 - py) * 18}deg`)
    el.style.setProperty('--ry', `${(px - 0.5) * 22}deg`)
    el.style.setProperty('--hyp', String(Math.min(1, Math.hypot(px - 0.5, py - 0.5) * 2)))
  }
  const onEnter = () => {
    ref.current?.classList.add('is-hover')
    if (state === 'unlocked') blip({ freq: 1400, dur: 0.03, gain: 0.015 })
  }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.classList.remove('is-hover')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  const unlocked = state === 'unlocked'

  return (
    <motion.div
      className="holo-slot"
      initial={{ opacity: 0, y: 60, rotateX: 24 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 1, delay: (order % 4) * 0.08, ease: EASE }}
    >
      <button
        type="button"
        ref={ref}
        className={`holo holo--${cert.rarity}`}
        data-state={state}
        onPointerMove={onMove}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={() => {
          if (!unlocked) return
          blip({ freq: 1180, dur: 0.08 })
          onOpen(index)
        }}
        aria-disabled={!unlocked}
        aria-label={unlocked ? `${cert.title}, ${cert.issuer}. Open certificate` : 'Locked credential'}
        data-cursor={unlocked ? 'View' : 'Locked'}
      >
        <div className="holo__flip">
          <div className="holo__back" aria-hidden="true">
            <div className="holo__lock">
              <span className="holo__shackle" />
              <span className="holo__body" />
            </div>
            <span className="holo__backlabel">Locked</span>
            <span className="holo__backrarity">{RARITY[cert.rarity]}</span>
            <div className="holo__burst">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ '--a': `${i * 36}deg` }} />
              ))}
            </div>
          </div>

          <div className="holo__front">
            <div className="holo__top">
              <span className="holo__rarity">{RARITY[cert.rarity]}</span>
              <span className="holo__xp">+{XP[cert.rarity] ?? 100} XP</span>
            </div>
            {cert.image ? (
              <div className="holo__art" aria-hidden="true">
                <img src={cert.image} alt="" loading="lazy" decoding="async" />
              </div>
            ) : (
              <div className="holo__emblem" aria-hidden="true">
                <span className="holo__ring" />
                <span className="holo__mono">{cert.total ? cert.total.score : initials(cert.issuer)}</span>
              </div>
            )}
            <div className="holo__text">
              <span className="holo__topic">{cert.topic}</span>
              <h3>{cert.title}</h3>
              <p>{cert.issuer}</p>
            </div>
            <div className="holo__foot">
              <span>{cert.date}</span>
              <span>View ↗</span>
            </div>
            <span className="holo__shine" aria-hidden="true" />
            <span className="holo__glare" aria-hidden="true" />
          </div>
        </div>
      </button>
    </motion.div>
  )
}

export default function Certificates() {
  const N = certificates.length
  const [found, setFound] = useState([])
  const [openIndex, setOpenIndex] = useState(null)
  const [toast, setToast] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const xp = found.reduce((sum, c) => sum + (XP[c.rarity] ?? 100), 0)
  const maxXp = certificates.reduce((sum, c) => sum + (XP[c.rarity] ?? 100), 0)

  const onUnlock = (cert) =>
    setFound((list) => (list.includes(cert) ? list : [...list, cert]))

  useEffect(() => {
    if (found.length !== N || N === 0) return undefined
    setToast(true)
    chime()
    const t = setTimeout(() => setToast(false), 3600)
    return () => clearTimeout(t)
  }, [found.length, N])

  const cert = openIndex !== null ? certificates[openIndex] : null

  return (
    <section className="section vault-section" id="certs">
      <LazyScene className="badge-slot">
        <LanyardScene onOpen={() => setProfileOpen(true)} />
      </LazyScene>
      {/* The 3D badge cannot take focus, so keyboard users get a real button. */}
      <button type="button" className="badge-open" onClick={() => setProfileOpen(true)}>
        View my ID card
      </button>
      <div className="vault__head has-badge">
        <div>
          <div className="label">
            <Scramble text="Certificates / Credentials" />
          </div>
          <h2 className="vault__title">
            <FlipText text="The" />{' '}
            <em>
              <FlipText text="collection" delay={0.12} />
            </em>
          </h2>
        </div>
        <div className="vault__hud" aria-live="polite">
          <div className="vault__row">
            <span>Unlocked</span>
            <strong>
              {found.length}
              <small>/{N}</small>
            </strong>
          </div>
          <div className="vault__xp" aria-hidden="true">
            <motion.i
              initial={{ scaleX: 0 }}
              animate={{ scaleX: maxXp ? xp / maxXp : 0 }}
              transition={{ duration: 0.9, ease: EASE }}
            />
          </div>
          <div className="vault__row vault__row--small">
            <span>XP</span>
            <span>
              {xp} / {maxXp}
            </span>
          </div>
        </div>
      </div>

      {certificateGroups.map((group, gi) => {
        const items = certificates.map((c, i) => ({ c, i })).filter(({ c }) => c.group === group.key)
        if (!items.length) return null
        return (
          <section className="vault-group" key={group.key} aria-labelledby={`vault-${group.key}`}>
            <div className="vault-group__head">
              <span className="vault-group__index">{String(gi + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="vault-group__title" id={`vault-${group.key}`}>
                  {group.title}
                </h3>
                <p className="vault-group__blurb">{group.blurb}</p>
              </div>
              <span className="vault-group__count">
                {items.length} {items.length === 1 ? 'credential' : 'credentials'}
              </span>
            </div>
            <Skew>
              <div className="vault">
                {items.map(({ c, i }, order) => (
                  <HoloCard
                    key={c.credentialId || c.title}
                    cert={c}
                    index={i}
                    order={order}
                    onUnlock={onUnlock}
                    onOpen={setOpenIndex}
                  />
                ))}
              </div>
            </Skew>
          </section>
        )
      })}

      {createPortal(
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <span className="toast__icon" aria-hidden="true">★</span>
              <div>
                <strong>Collection complete</strong>
                <span>
                  {N}/{N} credentials unlocked · {maxXp} XP
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <Modal
        open={cert !== null}
        onClose={() => setOpenIndex(null)}
        onPrev={() => setOpenIndex((i) => (i === null ? null : (i - 1 + N) % N))}
        onNext={() => setOpenIndex((i) => (i === null ? null : (i + 1) % N))}
        label={cert ? `${cert.title} certificate` : 'Certificate'}
      >
        {cert && <CertView cert={cert} position={openIndex} total={N} />}
      </Modal>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} label="Developer ID profile">
        <ProfileView />
      </Modal>
    </section>
  )
}
