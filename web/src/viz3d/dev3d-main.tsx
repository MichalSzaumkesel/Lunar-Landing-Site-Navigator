// Dev harness: mounts SurfaceView for the active store scenario, without the main app.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../app/theme.css'
import { Transport } from '../app/Transport'
import { PRESETS } from '../config/presets'
import { useAppStore } from '../state/store'
import { usePlaybackLoop } from '../state/usePlaybackLoop'
import { SurfaceView } from './SurfaceView'

export default function Dev() {
  usePlaybackLoop()
  const scenarios = useAppStore((s) => s.scenarios)
  const activeId = useAppStore((s) => s.activeScenarioId)
  const setActive = useAppStore((s) => s.setActiveScenario)
  const applyPreset = useAppStore((s) => s.applyPreset)

  return (
    <div className="dev3d">
      <div className="dev3d__bar">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => applyPreset(p)}>
            {p.id}
          </button>
        ))}
        <select value={activeId} onChange={(e) => setActive(e.target.value)} aria-label="Scenario">
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.siteId}
            </option>
          ))}
        </select>
      </div>
      <SurfaceView scenarioId={activeId} />
      <Transport />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dev />
  </StrictMode>,
)
