import type { ObserverHeightM } from '../lib/types'
import { useDemoStore } from '../components/demo/demoState'
import { useBundleLoading } from '../components/demo/useBundleLoading'
import { useTourStore } from '../components/help/tourState'
import { useAppStore } from '../state/store'
import type { Mode } from '../state/types'
import { PresetBar } from './PresetBar'

const MODES: { id: Mode; label: string }[] = [
  { id: 'simple', label: 'Simple' },
  { id: 'advanced', label: 'Advanced' },
]

const HEIGHTS: ObserverHeightM[] = [2, 10]

export function TopBar() {
  const mode = useAppStore((s) => s.mode)
  const setMode = useAppStore((s) => s.setMode)
  const observerHeightM = useAppStore((s) => s.observerHeightM)
  const setObserverHeight = useAppStore((s) => s.setObserverHeight)
  const openTour = useTourStore((s) => s.openTour)
  const closeTour = useTourStore((s) => s.closeTour)
  const isDemoActive = useDemoStore((s) => s.isActive)
  const startDemo = useDemoStore((s) => s.startDemo)
  const stopDemo = useDemoStore((s) => s.stopDemo)
  const isBundleLoading = useBundleLoading()

  const handleDemoClick = () => {
    if (isDemoActive) {
      stopDemo()
      return
    }
    closeTour()
    startDemo()
  }

  return (
    <header className="topbar">
      <h1 className="brand">Lunar Landing Site Navigator</h1>
      {mode === 'advanced' && <PresetBar />}
      <span className="topbar__spacer" />
      <button
        type="button"
        className="ghost"
        data-tour="help-button"
        aria-label="Open the tutorial"
        onClick={() => {
          if (isDemoActive) stopDemo()
          openTour(0)
        }}
      >
        <span aria-hidden="true">(?)</span> Tutorial
      </button>
      <button
        type="button"
        className="ghost"
        aria-label="Start demo"
        aria-pressed={isDemoActive}
        disabled={isBundleLoading}
        title={isBundleLoading ? 'Site data is loading...' : 'Start demo'}
        onClick={handleDemoClick}
      >
        Demo
      </button>
      <div className="group" role="group" aria-label="Mode" data-tour="mode-switch">
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'advanced' && (
        <div className="group" role="group" aria-label="Observer height" data-tour="observer-height">
          <span className="group__label">Observer height</span>
          {HEIGHTS.map((h) => (
            <button key={h} aria-pressed={observerHeightM === h} onClick={() => setObserverHeight(h)}>
              {h} m
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
