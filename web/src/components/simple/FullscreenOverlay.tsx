import { fmtUtc } from '../sky/geometry'
import { useAppStore } from '../../state/store'

/** Bottom bar shown in full screen: current time and Play/Pause, using the shared store. */
export function FullscreenOverlay({ cursorMs }: { cursorMs: number }) {
  const playing = useAppStore((s) => s.playing)
  const togglePlaying = useAppStore((s) => s.togglePlaying)
  return (
    <div className="simple-fs-bar">
      <span className="simple-fs-bar__time">{fmtUtc(cursorMs)}</span>
      <button type="button" className="simple-fs-bar__play" aria-pressed={playing} onClick={togglePlaying}>
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  )
}
