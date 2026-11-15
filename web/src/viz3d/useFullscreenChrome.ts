import { useEffect } from 'react'
import type { RefObject } from 'react'

export const CHROME_HIDE_MS = 3000

/**
 * In full screen the 3D controls float over the canvas and hide after a few seconds without input.
 * The hook only sets `data-chrome="shown" | "hidden"` on the `.surface` root while one of its ancestors
 * is in full screen; the CSS in surface.css does the rest. Pointer, touch, key and focus activity bring
 * the controls back; they never hide while the pointer is over them or focus is inside them.
 */
export function useFullscreenChrome(rootRef: RefObject<HTMLElement | null>, hideMs = CHROME_HIDE_MS): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let timer = 0
    let active = false

    const set = (v: 'shown' | 'hidden') => {
      if (root.getAttribute('data-chrome') !== v) root.setAttribute('data-chrome', v)
    }
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const side = root.querySelector('.surface__side')
        // :hover can stick on touch screens, so it only counts where a real pointer exists.
        const hoverOk = window.matchMedia?.('(hover: hover)').matches ?? true
        if (side && ((hoverOk && side.matches(':hover')) || side.contains(document.activeElement))) {
          arm()
          return
        }
        set('hidden')
      }, hideMs)
    }
    const show = () => {
      if (!active) return
      set('shown')
      arm()
    }
    const sync = () => {
      const now = root.closest('[data-fullscreen="true"]') !== null
      if (now === active) return
      active = now
      window.clearTimeout(timer)
      if (now) {
        set('shown')
        arm()
      } else {
        root.removeAttribute('data-chrome')
      }
    }

    const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'focusin'] as const
    events.forEach((e) => root.addEventListener(e, show, { passive: true }))
    const mo = new MutationObserver(sync)
    mo.observe(document.body, { attributes: true, attributeFilter: ['data-fullscreen'], subtree: true })
    sync()
    return () => {
      window.clearTimeout(timer)
      mo.disconnect()
      events.forEach((e) => root.removeEventListener(e, show))
      root.removeAttribute('data-chrome')
    }
  }, [rootRef, hideMs])
}
