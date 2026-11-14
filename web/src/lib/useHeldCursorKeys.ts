import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { createKeyMotion, isArrowKey } from '../viz3d/keyMotion'
import type { KeyMotion } from '../viz3d/keyMotion'

/** Cursor speed of a held arrow key, hours per second (Shift 3x, Alt 0.25x). */
const HOURS_PER_S = 24

export interface HeldCursorOptions {
  maxH: number
  read: () => number
  write: (h: number) => void
  /** Called when a held key takes over (e.g. pause Play). */
  onStart?: () => void
}

/**
 * Smooth cursor motion for a held arrow key. A single press keeps its native step; only auto-repeat
 * events are taken over by a frame-based motion, so the speed does not depend on the key-repeat rate.
 */
export function useHeldCursorKeys(o: HeldCursorOptions) {
  const ref = useRef(o)
  useEffect(() => {
    ref.current = o
  })
  const motionRef = useRef<KeyMotion | null>(null)
  useEffect(() => {
    const motion = createKeyMotion({
      speed: HOURS_PER_S,
      reducedMotion: () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
      onStart: () => ref.current.onStart?.(),
      onMove: (dx, dy) => {
        const { maxH, read, write } = ref.current
        write(Math.min(maxH, Math.max(0, Math.min(read(), maxH) + dx + dy)))
      },
    })
    motionRef.current = motion
    return () => {
      motion.dispose()
      motionRef.current = null
    }
  }, [])

  return {
    /** Returns true when the event was taken over (the caller then skips its own step). */
    onKeyDown(e: KeyboardEvent): boolean {
      if (!e.repeat || !isArrowKey(e.key)) return false
      e.preventDefault()
      motionRef.current?.handleKey(e, true)
      return true
    },
    onKeyUp(e: KeyboardEvent): void {
      motionRef.current?.handleKey(e, false)
    },
    onBlur(): void {
      motionRef.current?.release()
    },
  }
}
