import { useEffect, useState } from 'react'
import { SPEEDS_H_PER_SEC } from '../config/presets'
import { useHeldCursorKeys } from '../lib/useHeldCursorKeys'
import { formatSpeed } from '../lib/speedLabel'
import { scenarioCursorUtc } from '../state/selectors'
import { useAppStore } from '../state/store'

const NARROW = '(max-width: 600px)'

function useNarrow(): boolean {
  const mq = () => (typeof window.matchMedia === 'function' ? window.matchMedia(NARROW) : null)
  const [narrow, setNarrow] = useState(() => mq()?.matches ?? false)
  useEffect(() => {
    const m = mq()
    if (!m) return
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
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

  const narrow = useNarrow()
  const loopH = Math.min(...scenarios.map((s) => s.durationH))
  const held = useHeldCursorKeys({ maxH: loopH, read: () => useAppStore.getState().cursorH, write: setCursorH })

  return (
    <footer className="transport" data-tour="transport-play">
      <button className="primary transport__play" onClick={togglePlaying} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <label className="group">
        <select className="transport__speed" aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {SPEEDS_H_PER_SEC.map((v) => (
            <option key={v} value={v}>
              {formatSpeed(v, narrow)}
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
        onKeyDown={held.onKeyDown}
        onKeyUp={held.onKeyUp}
        onBlur={held.onBlur}
        aria-label="Time cursor"
        aria-valuetext={`+${cursorH.toFixed(1)} h from window start`}
      />
      <span className="readout">
        {active ? scenarioCursorUtc(active, cursorH) : ''} · +{cursorH.toFixed(1)} h
      </span>
    </footer>
  )
}
