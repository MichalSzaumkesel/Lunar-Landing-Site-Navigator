import { Component, Suspense, lazy, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useTourStore } from '../help/tourState'
import { Loupe } from '../sky/Loupe'
import { Panorama } from '../sky/Panorama'
import { SkyPlot } from '../sky/SkyPlot'
import { useDemoStore } from '../demo/demoState'
import { useAppStore } from '../../state/store'
import { nextTabIndex } from './tabs'
import './scenario.css'

// three.js stays out of the first screen: the 3D view loads when its tab is first selected.
const SurfaceView = lazy(() => import('../../viz3d/SurfaceView').then((m) => ({ default: m.SurfaceView })))

type ViewKey = 'polar' | 'panorama' | '3d'

const TABS: { key: ViewKey; label: string }[] = [
  { key: 'polar', label: 'Polar' },
  { key: 'panorama', label: 'Panorama' },
  { key: '3d', label: '3D' },
]

interface BoundaryState {
  failed: boolean
}

// Catches a failed chunk load of the 3D view.
class ViewBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="views__message views__message--error" role="alert">
          Could not load the 3D view. Reload the page or use another view.
        </div>
      )
    }
    return this.props.children
  }
}

function PolarPanel({ scenarioId, siteName }: { scenarioId: string; siteName?: string }) {
  const isMulti = useAppStore((s) => s.scenarios.length > 1)
  const isActive = useAppStore((s) => s.activeScenarioId === scenarioId)
  const tourOpen = useTourStore((s) => s.isOpen)
  const [loupeOpen, setLoupeOpen] = useState(!isMulti)
  const [prevMulti, setPrevMulti] = useState(isMulti)
  const loupeId = useId()

  if (prevMulti !== isMulti) {
    setPrevMulti(isMulti)
    setLoupeOpen(!isMulti)
  }

  // Demo steps such as the sunset countdown open the loupe on the active card; the user's own choice is kept.
  const demoLoupe = useDemoStore((s) => s.loupeOpen) && isActive
  const isExpanded = tourOpen || loupeOpen || demoLoupe

  return (
    <div className="views__polar">
      <div className="views__sky" data-tour="sky-plot">
        <SkyPlot scenarioId={scenarioId} />
      </div>
      <div className="views__loupe" data-tour="loupe">
        <button
          type="button"
          className="views__loupe-toggle"
          aria-expanded={isExpanded}
          aria-controls={loupeId}
          title={siteName ? `Loupe (${siteName})` : undefined}
          onClick={() => setLoupeOpen((o) => !o)}
        >
          Loupe
        </button>
        <div id={loupeId}>{isExpanded && <Loupe scenarioId={scenarioId} />}</div>
      </div>
    </div>
  )
}

export function SkyViews({ scenarioId, siteName }: { scenarioId: string; siteName?: string }) {
  const [view, setView] = useState<ViewKey>('polar')
  const baseId = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Arrow keys move focus between tabs; Enter or Space selects (the 3D view is costly to mount).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = TABS.findIndex((t) => t.key === view)
    const focused = tabRefs.current.findIndex((el) => el === document.activeElement)
    const next = nextTabIndex(e.key, focused >= 0 ? focused : current, TABS.length)
    if (next === null) return
    e.preventDefault()
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="views">
      <div
        className="views__tabs"
        data-tour="view-tabs"
        role="tablist"
        aria-label={siteName ? `Sky view, ${siteName}` : 'Sky view'}
        onKeyDown={onKeyDown}
      >
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.key}`}
            aria-selected={view === t.key}
            aria-controls={`${baseId}-panel`}
            tabIndex={view === t.key ? 0 : -1}
            className="views__tab"
            onClick={() => setView(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${view}`} className="views__panel">
        {view === 'polar' && <PolarPanel scenarioId={scenarioId} siteName={siteName} />}
        {view === 'panorama' && <Panorama scenarioId={scenarioId} />}
        {view === '3d' && (
          <ViewBoundary>
            <Suspense
              fallback={
                <div className="views__message" aria-busy="true">
                  Loading 3D view
                </div>
              }
            >
              <SurfaceView scenarioId={scenarioId} />
            </Suspense>
          </ViewBoundary>
        )}
      </div>
    </div>
  )
}
