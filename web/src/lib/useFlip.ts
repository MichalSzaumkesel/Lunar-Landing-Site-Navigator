import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { MOTION_EASE, MOTION_MS, prefersReducedMotion } from './motion'

const STALE_MS = 1000

export interface Flip {
  /** Call right before an action that adds or removes an item: remembers where every item is now. */
  capture: () => void
}

/** Lets a card ask its board to capture positions before it removes itself. */
export const FlipContext = createContext<Flip | null>(null)
export const useFlipCapture = (): (() => void) | undefined => useContext(FlipContext)?.capture

/**
 * FLIP for a list: items marked data-flip-key slide from their captured position to the new one
 * (transform only, nothing is measured per frame). Runs when `keys` changes, and only if capture()
 * was called a moment before; so a re-ordering from another source never animates from stale data.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, keys: string, durationMs: number = MOTION_MS.normal): Flip {
  const before = useRef<{ at: number; rects: Map<string, DOMRect> } | null>(null)

  const capture = useCallback(() => {
    const root = ref.current
    if (!root) return
    const rects = new Map<string, DOMRect>()
    root.querySelectorAll<HTMLElement>('[data-flip-key]').forEach((el) => {
      rects.set(el.dataset.flipKey as string, el.getBoundingClientRect())
    })
    before.current = { at: Date.now(), rects }
  }, [ref])

  useLayoutEffect(() => {
    const snap = before.current
    const root = ref.current
    if (!snap || !root || Date.now() - snap.at > STALE_MS) {
      before.current = null
      return
    }
    before.current = null
    if (prefersReducedMotion()) return
    root.querySelectorAll<HTMLElement>('[data-flip-key]').forEach((el) => {
      const old = snap.rects.get(el.dataset.flipKey as string)
      if (!old || typeof el.animate !== 'function') return
      const now = el.getBoundingClientRect()
      const dx = old.left - now.left
      const dy = old.top - now.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: durationMs, easing: MOTION_EASE.out },
      )
    })
    // ref is stable; only a change of the item set should replay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, durationMs])

  return useMemo(() => ({ capture }), [capture])
}
