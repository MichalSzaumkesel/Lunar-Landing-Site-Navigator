import { useEffect } from 'react'
import { useAppStore } from '../../state/store'
import { useDemoStore } from '../demo/demoState'
import { getStoredTourStatus, setStoredTourStatus, useTourStore } from './tourState'
import { shouldAutoStart } from './tourSteps'

/** Wait for the first paint and the lazy chunks so the first step finds its target. */
export const AUTO_START_DELAY_MS = 900

/**
 * Opens the tutorial by itself on a visitor's first visit (per level). It is remembered at once, so
 * a reload never shows it again; `?tour=0` (the demo opener) and a running demo suppress it.
 */
export function TourAutoStart() {
  const mode = useAppStore((s) => s.mode)

  useEffect(() => {
    const suppressed = new URLSearchParams(window.location.search).get('tour') === '0'
    if (!shouldAutoStart(getStoredTourStatus(mode), suppressed)) return
    const id = window.setTimeout(() => {
      if (useTourStore.getState().isOpen || useDemoStore.getState().isActive) return
      setStoredTourStatus(mode, 'done')
      useTourStore.getState().openTour(0)
    }, AUTO_START_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [mode])

  return null
}
