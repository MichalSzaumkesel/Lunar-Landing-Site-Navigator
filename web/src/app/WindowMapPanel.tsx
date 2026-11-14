import { WindowMap } from '../components/finder/WindowMap'

/** Window map (it already contains the mission rules form), one lazy chunk that also pulls in the worker. */
export default function WindowMapPanel() {
  return (
    <div className="panel-stack">
      <WindowMap />
    </div>
  )
}
