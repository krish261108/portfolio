import { Suspense, useEffect, useRef, useState } from 'react'
import ErrorBoundary from './ErrorBoundary'
import { SceneVisible } from './SceneKit'
import { useIntro } from '../lib/intro'
import { hasWebGL2 } from '../lib/webgl'

// Mounts a WebGL scene once its slot comes within `margin` of the viewport,
// only after the visitor is through the entry gate, and only if WebGL2 exists.
// Once mounted it stays mounted: scrolling away pauses it (no frames rendered)
// rather than destroying it. Creating a context and compiling its shaders is
// what made scrolling hitch, so it should happen once, ahead of time.
export default function LazyScene({ children, className = '', margin = '150% 0px' }) {
  const ref = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const { entered } = useIntro()

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setMounted(true)
      setVisible(true)
      return undefined
    }
    // IntersectionObserver delivers on the frame loop, so relying on its first
    // callback alone can leave a scene unmounted. Measure ourselves too, on a
    // later tick, since at mount layout has not settled yet.
    const timer = setTimeout(() => {
      const r = el.getBoundingClientRect()
      const h = window.innerHeight
      if (r.top < h * 2.5 && r.bottom > -h * 1.5) setMounted(true)
      if (r.top < h && r.bottom > 0) setVisible(true)
    }, 0)
    // Entries arrive batched oldest-first: the last one is the current state.
    const last = (entries) => entries[entries.length - 1].isIntersecting
    const near = new IntersectionObserver((entries) => last(entries) && setMounted(true), { rootMargin: margin })
    // A small margin so a scene is already drawing as it slides into view.
    const onScreen = new IntersectionObserver((entries) => setVisible(last(entries)), { rootMargin: '10% 0px' })
    near.observe(el)
    onScreen.observe(el)
    return () => {
      clearTimeout(timer)
      near.disconnect()
      onScreen.disconnect()
    }
  }, [margin])

  const show = mounted && entered && hasWebGL2()

  return (
    <div className={className} ref={ref}>
      {show && (
        <SceneVisible.Provider value={visible}>
          <ErrorBoundary>
            <Suspense fallback={null}>{children}</Suspense>
          </ErrorBoundary>
        </SceneVisible.Provider>
      )}
    </div>
  )
}
