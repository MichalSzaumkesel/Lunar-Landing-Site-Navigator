import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/** Focusable, visible descendants of `root` in DOM order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute('tabindex') !== '-1' && !el.hasAttribute('inert') && !el.closest('[inert]') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Pure helper: the element that should receive focus when Tab / Shift+Tab is pressed,
 * or null when the browser default is fine.
 */
export function nextTrapTarget(
  items: HTMLElement[],
  current: Element | null,
  shift: boolean,
  contains: boolean,
): HTMLElement | null {
  if (items.length === 0) return null
  const first = items[0]
  const last = items[items.length - 1]
  if (!contains) return shift ? last : first
  if (shift && current === first) return last
  if (!shift && current === last) return first
  return null
}

/**
 * Keeps Tab / Shift+Tab inside `ref` while `active`, and (by default) returns focus to the
 * previously focused element when the trap ends. Call it before any effect that moves focus
 * into the container so the opener is captured first.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: { restoreFocus?: boolean } = {},
): void {
  const restoreFocus = options.restoreFocus ?? true
  useEffect(() => {
    if (!active) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented) return
      const root = ref.current
      if (!root) return
      const next = nextTrapTarget(focusableIn(root), document.activeElement, e.shiftKey, root.contains(document.activeElement))
      if (next) {
        e.preventDefault()
        next.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (restoreFocus && opener?.isConnected) opener.focus()
    }
  }, [ref, active, restoreFocus])
}
