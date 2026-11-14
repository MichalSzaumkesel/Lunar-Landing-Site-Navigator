import { useLayoutEffect, useRef, useState, type FC, type RefObject } from 'react'
import type { Site } from '../../lib/types'
import { categoryLabel, formatLatLonHemi, statusLabel } from './tooltipText'

/** Tooltip anchor: the marker centre in pixels relative to the map container. */
export interface MarkerTip {
  site: Site
  x: number
  y: number
}

const GAP = 12
const PAD = 4

/** Hover / focus tooltip. pointer-events: none, so it never blocks clicks; clamped inside the container. */
export const MarkerTooltip: FC<{ tip: MarkerTip | null; containerRef: RefObject<HTMLElement | null> }> = ({
  tip,
  containerRef,
}) => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const box = containerRef.current
    if (!tip || !el || !box) {
      setPos(null)
      return
    }
    const W = box.clientWidth
    const H = box.clientHeight
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = tip.x - w / 2
    let top = tip.y - GAP - h
    if (top < PAD) top = tip.y + GAP // no room above: show below the marker
    left = Math.max(PAD, Math.min(W - w - PAD, left))
    top = Math.max(PAD, Math.min(H - h - PAD, top))
    setPos({ left, top })
  }, [tip, containerRef])

  if (!tip) return null
  const status = statusLabel(tip.site.status)
  return (
    <div
      ref={ref}
      className="map-tooltip"
      role="tooltip"
      id="map-tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      <div className="map-tooltip__name">{tip.site.name}</div>
      <div className="map-tooltip__row">
        {categoryLabel(tip.site.category)}
        {status ? ` · ${status}` : ''}
      </div>
      <div className="map-tooltip__row map-tooltip__coords">{formatLatLonHemi(tip.site.lat_deg, tip.site.lon_deg)}</div>
    </div>
  )
}
