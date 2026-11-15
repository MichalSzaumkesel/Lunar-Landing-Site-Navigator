const MAX_WAIT_MS = 900
const STABLE_MS = 100

export interface ViewBand {
  top: number
  bottom: number
}

/**
 * The part of the viewport a tour target can really be seen in: the sticky footer (demo caption and
 * transport bar) covers the bottom, so the usable band ends where that bar starts.
 */
export function usableViewBand(): ViewBand {
  let bottom = window.innerHeight
  const footer = document.querySelector('.app__footer')
  if (footer) {
    const pos = window.getComputedStyle(footer).position
    if (pos === 'sticky' || pos === 'fixed') {
      const top = footer.getBoundingClientRect().top
      if (top > 0 && top < bottom) bottom = top
    }
  }
  return { top: 0, bottom }
}

export function isFullyInView(el: Element, band: ViewBand = usableViewBand()): boolean {
  const r = el.getBoundingClientRect()
  return r.top >= band.top && r.left >= 0 && r.bottom <= band.bottom && r.right <= window.innerWidth
}

/**
 * Scrolls a target into the usable band: centred when it fits, aligned to the top when it is taller
 * than the band. Uses scroll margins so the sticky footer is left out of the centring. Returns a restore function.
 */
export function scrollIntoUsableView(el: Element, behavior: ScrollBehavior): () => void {
  const band = usableViewBand()
  const covered = window.innerHeight - band.bottom
  const tooTall = el.getBoundingClientRect().height > band.bottom - band.top - 16
  const style = (el as HTMLElement).style
  const prev = { bottom: style?.scrollMarginBottom ?? '', top: style?.scrollMarginTop ?? '' }
  if (style) {
    style.scrollMarginBottom = tooTall ? '0px' : `${covered}px`
    style.scrollMarginTop = tooTall ? '8px' : '0px'
  }
  el.scrollIntoView?.({ block: tooTall ? 'start' : 'center', inline: 'nearest', behavior })
  return () => {
    if (!style) return
    style.scrollMarginBottom = prev.bottom
    style.scrollMarginTop = prev.top
  }
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
