import Lenis from 'lenis'

let lenis = null

export function initSmoothScroll() {
  if (lenis || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
  // anchors: Lenis owns in-page #links, so a native jump cannot be undone mid-glide.
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, anchors: true })
  let id = 0
  const raf = (t) => {
    lenis?.raf(t)
    id = requestAnimationFrame(raf)
  }
  id = requestAnimationFrame(raf)
  return () => {
    cancelAnimationFrame(id)
    lenis?.destroy()
    lenis = null
  }
}

export function scrollToY(y, { smooth = true, duration = 1, onComplete } = {}) {
  if (lenis) {
    lenis.scrollTo(y, { immediate: !smooth, duration, onComplete, force: true, lock: false })
  } else {
    // No Lenis means reduced motion was requested: jump, don't animate.
    window.scrollTo({ top: y, behavior: 'instant' })
    onComplete?.()
  }
}

// Move the page exactly to y this frame, keeping Lenis in sync (a plain
// window.scrollTo while Lenis runs gets pulled back to Lenis's own target).
// For driven camera moves such as the film's autopilot.
export function scrollImmediate(y) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true, lock: false })
  else window.scrollTo(0, y)
}

export function stopSmoothScroll() {
  lenis?.stop()
}

export function startSmoothScroll() {
  lenis?.start()
}
