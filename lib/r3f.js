// Overlays (HUD text, headings) sit on top of every canvas, so a canvas never
// receives pointer events itself. Each Canvas listens on #root instead and maps
// the pointer into its own rect — clamped, since the pointer is usually outside
// any given canvas and an unclamped value flings parallax off-screen.
export function computeFromRect(event, state) {
  const r = state.gl.domElement.getBoundingClientRect()
  if (!r.width || !r.height) return
  const x = ((event.clientX - r.left) / r.width) * 2 - 1
  const y = -((event.clientY - r.top) / r.height) * 2 + 1
  state.pointer.set(Math.max(-1.2, Math.min(1.2, x)), Math.max(-1.2, Math.min(1.2, y)))
  state.raycaster.setFromCamera(state.pointer, state.camera)
}

export function sceneCanvasProps(onCreated) {
  return {
    eventSource: typeof document !== 'undefined' ? document.getElementById('root') : undefined,
    eventPrefix: 'client',
    // offsetSize ignores CSS transforms: a canvas inside a scaled wrapper is
    // sized to its layout box, not its transformed (and therefore wrong) one.
    resize: { offsetSize: true, scroll: true, debounce: { scroll: 50, resize: 0 } },
    onCreated: (state) => {
      state.setEvents({ compute: computeFromRect })
      onCreated?.(state)
    },
  }
}
