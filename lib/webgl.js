let cached = null

// three r169 only requests a WebGL2 context; without one it throws.
export function hasWebGL2() {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    cached = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

// Phones and coarse-pointer devices get lighter scenes (no AO, no reflections).
export function isLowPower() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(max-width: 760px)').matches ||
    window.matchMedia('(pointer: coarse)').matches ||
    (navigator.hardwareConcurrency || 8) <= 4
  )
}
