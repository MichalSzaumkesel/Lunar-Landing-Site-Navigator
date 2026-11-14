const MAX_WAIT_MS = 900
const STABLE_MS = 100

export function isFullyInView(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth
}

// Calls done once the smooth scroll has finished; returns a cancel function.
export function whenScrollSettled(el: Element, done: () => void): () => void {
  let finished = false
  let raf = 0
  let cap = 0
  const cleanups: Array<() => void> = []
  const finish = () => {
    if (finished) return
    finished = true
    cancel()
    done()
  }
  const cancel = () => {
    finished = true
    cancelAnimationFrame(raf)
    clearTimeout(cap)
    cleanups.forEach((fn) => fn())
  }
  cap = window.setTimeout(finish, MAX_WAIT_MS)
  if ('onscrollend' in window) {
    window.addEventListener('scrollend', finish, { once: true })
    cleanups.push(() => window.removeEventListener('scrollend', finish))
  } else {
    let last = el.getBoundingClientRect().top
    let changedAt = performance.now()
    const tick = () => {
      const now = performance.now()
      const top = el.getBoundingClientRect().top
      if (top !== last) {
        last = top
        changedAt = now
      }
      if (now - changedAt >= STABLE_MS) finish()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }
  return cancel
}
