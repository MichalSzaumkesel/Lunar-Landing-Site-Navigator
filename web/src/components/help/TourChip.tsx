import { useState } from 'react'
import { usePresence } from '../../lib/usePresence'
import { useAppStore } from '../../state/store'
import { useDemoStore } from '../demo/demoState'
import { getStoredTourStatus, setStoredTourStatus, useTourStore } from './tourState'
import { shouldAutoStart } from './tourSteps'
import './tour.css'

/** Small opt-in prompt that replaces the auto-opening tutorial. */
export function TourChip() {
  const mode = useAppStore((s) => s.mode)
  const isOpen = useTourStore((s) => s.isOpen)
  const openTour = useTourStore((s) => s.openTour)
  const isDemoActive = useDemoStore((s) => s.isActive)
  const [, bump] = useState(0)

  const suppressed =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tour') === '0'
  const offered = !isOpen && !isDemoActive && shouldAutoStart(getStoredTourStatus(mode), suppressed)
  const { mounted, state } = usePresence(offered)
  if (!mounted) return null

  return (
    <div className="tour-chip presence-rise" data-state={state} role="group" aria-label="Tutorial offer">
      <button type="button" className="ghost tour-chip__go" onClick={() => openTour(0)}>
        New here? Take the tutorial
      </button>
      <button
        type="button"
        className="ghost tour-chip__close"
        aria-label="Dismiss the tutorial offer"
        onClick={() => {
          setStoredTourStatus(mode, 'done')
          bump((n) => n + 1)
        }}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}
