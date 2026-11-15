import { useLayoutEffect, type RefObject } from 'react'
import { usableViewBand } from './viewBand'

/** Gap kept between a popup and the viewport edge, in px. */
export const POPUP_MARGIN = 8

export interface PopupPlacement {
  /** Horizontal shift (px) that brings the popup inside the viewport. */
  dx: number
  /** Open above the trigger instead of below it. */
  flip: boolean
  /** Largest height (px) the popup may take on its side; it scrolls inside. */
  maxHeight: number
}

/**
 * Where a popup should sit so it stays fully inside the viewport.
 * `popup` is its natural box, `trigger` the box it hangs from (both in viewport coordinates).
 * Pure so it can be tested without a layout engine.
 */
export function placePopup(
  popup: { left: number; right: number; height: number },
  trigger: { top: number; bottom: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = POPUP_MARGIN,
): PopupPlacement {
  const width = popup.right - popup.left
  let dx = 0
  if (width >= viewport.width - 2 * margin) dx = margin - popup.left
  else if (popup.left < margin) dx = margin - popup.left
  else if (popup.right > viewport.width - margin) dx = viewport.width - margin - popup.right

  const below = Math.max(0, viewport.height - trigger.bottom - gap - margin)
  const above = Math.max(0, trigger.top - gap - margin)
  const flip = popup.height > below && above > below
  return { dx, flip, maxHeight: Math.floor(flip ? above : below) }
}

/**
 * Keeps an absolutely positioned popup inside the viewport: shifts it sideways, flips it above the
 * trigger when there is more room there and caps its height so the content scrolls instead of
 * running off screen. Re-measured on open, resize and orientation change.
 */
export function useClampedPopup(
  popupRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useLayoutEffect(() => {
    const popup = popupRef.current
    const trigger = triggerRef.current
    if (!active || !popup || !trigger) return
    const apply = () => {
      popup.style.removeProperty('translate')
      popup.style.removeProperty('max-height')
      popup.style.removeProperty('top')
      popup.style.removeProperty('bottom')
      popup.style.removeProperty('overflow-y')
      const p = popup.getBoundingClientRect()
      const t = trigger.getBoundingClientRect()
      if (p.width === 0 && p.height === 0) return
      const place = placePopup(
        { left: p.left, right: p.right, height: p.height },
        { top: t.top, bottom: t.bottom },
        { width: document.documentElement.clientWidth || window.innerWidth, height: usableViewBand().bottom },
      )
      if (place.dx !== 0) popup.style.setProperty('translate', `${place.dx}px 0`)
      if (p.height > place.maxHeight) {
        popup.style.setProperty('max-height', `${place.maxHeight}px`)
        popup.style.setProperty('overflow-y', 'auto')
      }
      if (place.flip) {
        // Anchor to the trigger's top edge: the popup's offset parent is its wrapper.
        popup.style.setProperty('top', 'auto')
        popup.style.setProperty('bottom', 'calc(100% + 6px)')
      }
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [popupRef, triggerRef, active])
}
