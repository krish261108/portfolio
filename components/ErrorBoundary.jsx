import { Component } from 'react'

// A WebGL scene that fails (no WebGL2, a GPU blocklist, a chunk that will not
// download after a redeploy) must take out only its own slot — never the page.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.warn('[scene disabled]', error)
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children
  }
}
