import { SPEEDS_H_PER_SEC } from '../config/presets'
import { scenarioCursorUtc } from '../state/selectors'
import { useAppStore } from '../state/store'

function speedLabel(hPerSec: number): string {
  return hPerSec >= 24 ? `${hPerSec / 24} d/s` : `${hPerSec} h/s`
}

/** Global transport: Play/Pause, speed and a scrubber for the shared time cursor. */
export function Transport() {
  const playing = useAppStore((s) => s.playing)
  const togglePlaying = useAppStore((s) => s.togglePlaying)
  const speed = useAppStore((s) => s.speedHPerSec)
  const setSpeed = useAppStore((s) => s.setSpeed)
  const cursorH = useAppStore((s) => s.cursorH)
  const setCursorH = useAppStore((s) => s.setCursorH)
  const scenarios = useAppStore((s) => s.scenarios)
  const active = useAppStore((s) => s.scenarios.find((x) => x.id === s.activeScenarioId))

  const loopH = Math.min(...scenarios.map((s) => s.durationH))

  return (
    <footer className="transport" data-tour="transport-play">
      <button className="primary" onClick={togglePlaying} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <label className="group">
        <span className="group__label">Speed</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS_H_PER_SEC.map((v) => (
            <option key={v} value={v}>
              {speedLabel(v)}
            </option>
          ))}
        </select>
      </label>
      <input
        className="transport__scrub"
        type="range"
        min={0}
        max={loopH}
        step={0.25}
        value={Math.min(cursorH, loopH)}
        onChange={(e) => setCursorH(Number(e.target.value))}
        aria-label="Time cursor"
        aria-valuetext={`+${cursorH.toFixed(1)} h from window start`}
      />
      <span className="readout">
        {active ? scenarioCursorUtc(active, cursorH) : ''} · +{cursorH.toFixed(1)} h
      </span>
    </footer>
  )
}
