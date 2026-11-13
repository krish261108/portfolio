import { startSmoothScroll, stopSmoothScroll } from './scroll'

// Several things want the page frozen at once (preloader, entry gate, modals).
// Keyed so one releasing its lock cannot unfreeze the page under another.
const holders = new Set()

function apply() {
  const locked = holders.size > 0
  document.documentElement.classList.toggle('is-locked', locked)
  if (locked) stopSmoothScroll()
  else startSmoothScroll()
}

export function lockScroll(key) {
  holders.add(key)
  apply()
}

export function unlockScroll(key) {
  holders.delete(key)
  apply()
}
