import { useEffect } from 'react'
import { useAppStore } from './store'

/** Drives the shared time cursor with requestAnimationFrame while `playing` is true. */
export function usePlaybackLoop(): void {
  const playing = useAppStore((s) => s.playing)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      // Cap dt so a background tab does not make the cursor jump.
      const dtSec = Math.min((now - last) / 1000, 0.1)
      last = now
      useAppStore.getState().tick(dtSec)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
