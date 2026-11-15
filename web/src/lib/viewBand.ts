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
