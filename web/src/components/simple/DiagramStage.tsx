import { Component, Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { Panorama } from '../sky/Panorama'
import { SkyPlot } from '../sky/SkyPlot'
import type { DiagramView } from './SkyHelp'

// three.js stays out of the first screen: the 3D chunk loads when the 3D view is first chosen.
const SurfaceView = lazy(() => import('../../viz3d/SurfaceView').then((m) => ({ default: m.SurfaceView })))

// Catches a failed chunk load of the 3D view.
class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="simple-stage__message simple-stage__message--error" role="alert">
          Could not load the 3D view. Reload the page or choose another view.
        </div>
      )
    }
    return this.props.children
  }
}

export function DiagramStage({ view, scenarioId }: { view: DiagramView; scenarioId: string }) {
  if (view === 'horizon') return <Panorama scenarioId={scenarioId} />
  if (view === '3d') {
    return (
      <ViewBoundary>
        <Suspense
          fallback={
            <div className="simple-stage__message" aria-busy="true">
              Loading 3D view
            </div>
          }
        >
          <SurfaceView scenarioId={scenarioId} />
        </Suspense>
      </ViewBoundary>
    )
  }
  return <SkyPlot scenarioId={scenarioId} />
}
