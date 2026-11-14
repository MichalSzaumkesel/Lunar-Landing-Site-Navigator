import { useEffect, useState } from 'react'
import { useAppStore } from '../state/store'

/**
 * Cursor time in hours, re-rendered at most every `intervalMs`. During Play the store moves
 * 60 times a second; readouts only need a few updates a second, so the rest is skipped.
 */
export function useThrottledCursorH(intervalMs = 100): number {
  const [h, setH] = useState(() => useAppStore.getState().cursorH)

  useEffect(() => {
    let last = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const publish = () => {
      timer = null
      last = performance.now()
      setH(useAppStore.getState().cursorH)
    }
    const unsubscribe = useAppStore.subscribe((s, prev) => {
      if (s.cursorH === prev.cursorH || timer !== null) return
      const wait = intervalMs - (performance.now() - last)
      if (wait <= 0) publish()
      else timer = setTimeout(publish, wait)
    })
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    }
  }, [intervalMs])

  return h
}
