import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { useSvgTextScale } from '../../lib/useSvgTextScale'
import type { Site } from '../../lib/types'
import { formatCoordDisplay } from './coords'
import { HEAT_GRADIENT, heatColor } from './heatScale'
import { renderMarkerGlyph } from './markerGlyphs'
import {
  gridImageMatrix,
  niceLength,
  poleForward,
  poleInverse,
  poleLocalFrame,
  poleScale,
} from './poleProjection'
import { loadIllum, type BasemapInfo, type IllumGrid } from './useBasemap'

export interface PoleMapProps {
  sites: Site[]
  selectedSiteIds: string[]
  activeSiteId: string | null
  pickMode: boolean
  basemap: BasemapInfo | null
  onSelectSite(id: string, shiftKey?: boolean): void
  onPickPoint(lat: number, lon: number): void
  onShowTip?(site: Site, markerEl: Element): void
  onHideTip?(): void
}

interface View {
  cx: number // projected metres (y up)
  cy: number
  half: number // half of the visible height in metres
}

const BASE_W = 720 // marker/label scale reference, same as the global map viewBox width
const EXTENT_HALF = 304000
const MIN_HALF = 1200
const MAX_HALF = 320000
const DEFAULT_HALF = 90000
const HEAT_HALF = 3200
const LAT_CIRCLES = [-80, -85, -89]
const MERIDIANS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

function heatScaleMax(g: IllumGrid): number {
  let m = 0
  for (const row of g.pct) for (const v of row) if (v > m) m = v
  return Math.max(10, Math.ceil(m / 10) * 10)
}

function illumDataUrl(g: IllumGrid, max: number): string | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = g.nx
  canvas.height = g.ny
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const img = ctx.createImageData(g.nx, g.ny)
  for (let r = 0; r < g.ny; r++) {
    for (let c = 0; c < g.nx; c++) {
      const v = g.pct[r]?.[c]
      const p = (r * g.nx + c) * 4
      if (v == null || !Number.isFinite(v)) continue
      const [R, G, B] = heatColor(v / max)
      img.data[p] = R
      img.data[p + 1] = G
      img.data[p + 2] = B
      img.data[p + 3] = 205
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function catColor(category: Site['category']): string {
  return `var(--cat-${category})`
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function fmtLen(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`
}

function viewFor(site: Site | undefined, half: number): View {
  if (!site) return { cx: 0, cy: 0, half: MAX_HALF }
  const p = poleForward(site.lat_deg, site.lon_deg)
  return { cx: p.x, cy: p.y, half }
}

export const PoleMap: FC<PoleMapProps> = ({
  sites,
  selectedSiteIds,
  activeSiteId,
  pickMode,
  basemap,
  onSelectSite,
  onPickPoint,
  onShowTip,
  onHideTip,
}) => {
  const poleSites = useMemo(() => sites.filter((s) => s.lat_deg <= -80), [sites])
  const activeSite = useMemo(() => poleSites.find((s) => s.id === activeSiteId), [poleSites, activeSiteId])

  const [view, setView] = useState<View>(() => viewFor(activeSite, DEFAULT_HALF))
  const [trackedSite, setTrackedSite] = useState<string | null>(activeSiteId)
  const [heat, setHeat] = useState(false)
  const [illum, setIllum] = useState<Record<string, IllumGrid | null>>({})
  const [imgFailed, setImgFailed] = useState(false)

  // Re-centre when the active site changes (derived state, no effect)
  if (trackedSite !== activeSiteId) {
    setTrackedSite(activeSiteId)
    if (activeSite) setView((v) => ({ ...viewFor(activeSite, Math.min(v.half, MAX_HALF)) }))
  }

  const svgRef = useRef<SVGSVGElement | null>(null)
  const coordRef = useRef<HTMLSpanElement | null>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null)
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  // Lazy-load the illumination grids when the layer is switched on
  useEffect(() => {
    if (!heat) return
    let cancelled = false
    for (const s of poleSites) {
      loadIllum(s.id).then((g) => {
        if (!cancelled) setIllum((prev) => (s.id in prev ? prev : { ...prev, [s.id]: g }))
      })
    }
    return () => {
      cancelled = true
    }
  }, [heat, poleSites])

  const heatImages = useMemo(() => {
    if (!heat) return []
    return Object.values(illum)
      .filter((g): g is IllumGrid => !!g)
      .map((g) => {
        const max = heatScaleMax(g)
        return {
          grid: g,
          max,
          url: illumDataUrl(g, max),
          matrix: gridImageMatrix(g.lat, g.lon, g.spacingM, g.nx, g.ny),
        }
      })
  }, [heat, illum])

  const activeHeat = heatImages.find((h) => h.grid.siteId === activeSiteId) ?? null
  const heatLoading = heat && poleSites.some((s) => !(s.id in illum))

  const w = view.half * 4
  const h = view.half * 2
  const x0 = view.cx - w / 2
  const y0 = -view.cy - h / 2
  const s = w / BASE_W // metres per reference px (markers, text)
  const scaleRef = useSvgTextScale(s)
  const setSvg = useCallback(
    (el: SVGSVGElement | null) => {
      svgRef.current = el
      scaleRef(el)
    },
    [scaleRef],
  )

  const toProjected = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const v = viewRef.current
    return {
      x: v.cx - v.half * 2 + ((clientX - rect.left) / rect.width) * v.half * 4,
      y: v.cy + v.half - ((clientY - rect.top) / rect.height) * v.half * 2,
    }
  }, [])

  const onHideTipRef = useRef(onHideTip)
  useEffect(() => {
    onHideTipRef.current = onHideTip
  }, [onHideTip])

  const zoomAt = useCallback((factor: number, px?: { x: number; y: number }) => {
    setView((v) => {
      const half = clamp(v.half * factor, MIN_HALF, MAX_HALF)
      const f = half / v.half
      const p = px ?? { x: v.cx, y: v.cy }
      return { half, cx: p.x - (p.x - v.cx) * f, cy: p.y - (p.y - v.cy) * f }
    })
  }, [])

  // Non-passive wheel listener so the page does not scroll while zooming the map
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      onHideTipRef.current?.()
      const p = toProjected(e.clientX, e.clientY)
      zoomAt(e.deltaY > 0 ? 1.25 : 0.8, p ?? undefined)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [toProjected, zoomAt])

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    const svg = svgRef.current
    if (d && svg && e.buttons === 1) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) > 4) {
        d.moved = true
        onHideTip?.()
        svg.setPointerCapture?.(d.id)
      }
      if (d.moved) {
        const rect = svg.getBoundingClientRect()
        d.x = e.clientX
        d.y = e.clientY
        setView((v) => ({
          ...v,
          cx: v.cx - (dx / rect.width) * v.half * 4,
          cy: v.cy + (dy / rect.height) * v.half * 2,
        }))
      }
    }
    const p = toProjected(e.clientX, e.clientY)
    if (p && coordRef.current) {
      const c = poleInverse(p.x, p.y)
      coordRef.current.textContent = c.lat > -80 ? '' : formatCoordDisplay(c.lat, c.lon)
    }
  }
  const onPointerUp = () => {
    // keep `moved` readable for the click that follows, clear it afterwards
    const d = drag.current
    if (d?.moved) setTimeout(() => (drag.current = null), 0)
    else drag.current = null
  }

  const handleSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (drag.current?.moved) return
    if (!pickMode) return
    const p = toProjected(e.clientX, e.clientY)
    if (!p) return
    const c = poleInverse(p.x, p.y)
    onPickPoint(Math.round(c.lat * 100) / 100, Math.round(c.lon * 100) / 100)
  }

  const onMarkerKey = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectSite(id)
    }
  }

  const showHeat = () => {
    const on = !heat
    setHeat(on)
    if (on && activeSite) {
      loadIllum(activeSite.id).then((g) => {
        if (g) {
          const p = poleForward(g.lat, g.lon)
          setView({ cx: p.x, cy: p.y, half: HEAT_HALF })
        }
      })
    }
  }

  const resetView = () => setView(viewFor(activeSite, DEFAULT_HALF))
  const fullView = () => setView({ cx: 0, cy: 0, half: MAX_HALF })

  // North arrow: at the active site, otherwise at the view centre
  const northSrc = activeSite
    ? { lat: activeSite.lat_deg, lon: activeSite.lon_deg }
    : poleInverse(view.cx, view.cy)
  const northFrame = poleLocalFrame(northSrc.lat, northSrc.lon)
  const northDeg = (Math.atan2(northFrame.north.x, northFrame.north.y) * 180) / Math.PI

  // Scale bar (ground metres, planar length corrected by the local scale factor)
  const centreLat = poleInverse(view.cx, view.cy).lat
  const k = poleScale(Math.min(-80, centreLat))
  const barGround = niceLength((w * 0.18) / k)
  const barPlanar = barGround * k

  const extent = basemap?.extentM ?? [-EXTENT_HALF, EXTENT_HALF, -EXTENT_HALF, EXTENT_HALF]
  const hasImage = !!basemap && !imgFailed
  const rho = (lat: number) => poleForward(lat, 0).y

  return (
    <div className="pole-map">
      <svg
        ref={setSvg}
        className="pole-map__svg svg-scaled"
        viewBox={`${x0} ${y0} ${w} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleSvgClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="region"
        aria-label="South pole map in polar stereographic projection with landing sites. Drag to pan, scroll to zoom."
        style={{ cursor: pickMode ? 'crosshair' : 'grab', touchAction: 'none' }}
      >
        {/* Data extent backdrop */}
        <rect
          x={extent[0]}
          y={-extent[3]}
          width={extent[1] - extent[0]}
          height={extent[3] - extent[2]}
          className="pole-map__backdrop"
        />
        {hasImage && basemap && (
          <image
            href={basemap.imageUrl}
            x={extent[0]}
            y={-extent[3]}
            width={extent[1] - extent[0]}
            height={extent[3] - extent[2]}
            preserveAspectRatio="none"
            onError={() => setImgFailed(true)}
          />
        )}

        {/* Illumination heatmap layers */}
        {heatImages.map(
          (hi) =>
            hi.url && (
              <image
                key={`heat-${hi.grid.siteId}`}
                href={hi.url}
                x={0}
                y={0}
                width={hi.grid.nx}
                height={hi.grid.ny}
                preserveAspectRatio="none"
                transform={`matrix(${hi.matrix.join(' ')})`}
                className="pole-map__heat"
              />
            ),
        )}

        {/* Graticule */}
        <g className="pole-map__grid" aria-hidden="true">
          {MERIDIANS.map((lon) => {
            const a = poleForward(-89.9, lon)
            const b = poleForward(-80, lon)
            return (
              <line
                key={`m-${lon}`}
                x1={a.x}
                y1={-a.y}
                x2={b.x}
                y2={-b.y}
                vectorEffect="non-scaling-stroke"
                className={lon === 0 ? 'pole-map__grid-line pole-map__grid-line--major' : 'pole-map__grid-line'}
              />
            )
          })}
          {LAT_CIRCLES.map((lat) => (
            <g key={`c-${lat}`}>
              <circle cx={0} cy={0} r={rho(lat)} vectorEffect="non-scaling-stroke" className="pole-map__grid-line" />
              <g transform={`translate(0 ${-rho(lat)}) scale(${s})`}>
                <text x={0} y={-3} textAnchor="middle" className="pole-map__label">
                  {Math.abs(lat)}°S
                </text>
              </g>
            </g>
          ))}
        </g>

        {/* Markers */}
        <g role="group" aria-label="South pole sites">
          {poleSites.map((site) => {
            const p = poleForward(site.lat_deg, site.lon_deg)
            const isSel = selectedSiteIds.includes(site.id)
            const isActive = site.id === activeSiteId
            const color = catColor(site.category)
            return (
              <g
                key={site.id}
                transform={`translate(${p.x} ${-p.y}) scale(${s})`}
                className="map-marker"
                role="button"
                tabIndex={0}
                aria-label={`${site.name} (${formatCoordDisplay(site.lat_deg, site.lon_deg)})`}
                aria-pressed={isActive}
                onClick={(e) => {
                  if (pickMode || drag.current?.moved) return
                  e.stopPropagation()
                  onSelectSite(site.id, e.shiftKey)
                }}
                onKeyDown={(e) => onMarkerKey(e, site.id)}
                onMouseEnter={(e) => onShowTip?.(site, e.currentTarget)}
                onMouseLeave={() => onHideTip?.()}
                onFocus={(e) => onShowTip?.(site, e.currentTarget)}
                onBlur={() => onHideTip?.()}
              >
                <circle cx={0} cy={0} r={14} fill="transparent" className="map-marker__target" />
                {isSel && (
                  <circle
                    cx={0}
                    cy={0}
                    r={9}
                    className="map-marker__ring"
                    style={{ stroke: isActive ? 'var(--focus)' : color }}
                  />
                )}
                {renderMarkerGlyph({ category: site.category, cx: 0, cy: 0, color, isActive })}
                {isActive && (
                  <text x={11} y={4} className="pole-map__site-label">
                    {site.name.replace(/^Artemis candidate region — /, '')}
                  </text>
                )}
              </g>
            )
          })}
        </g>

        {/* Scale bar */}
        <g aria-hidden="true">
          <g transform={`translate(${x0 + 14 * s} ${y0 + h - 22 * s})`}>
            <line x1={0} y1={0} x2={barPlanar} y2={0} className="pole-map__scale" vectorEffect="non-scaling-stroke" />
            <line x1={0} y1={-4 * s} x2={0} y2={4 * s} className="pole-map__scale" vectorEffect="non-scaling-stroke" />
            <line x1={barPlanar} y1={-4 * s} x2={barPlanar} y2={4 * s} className="pole-map__scale" vectorEffect="non-scaling-stroke" />
            <g transform={`scale(${s})`}>
              <text x={0} y={-8} className="pole-map__scale-label">
                {fmtLen(barGround)}
              </text>
            </g>
          </g>
        </g>
      </svg>

      <div className="pole-map__tools">
        <button type="button" onClick={() => zoomAt(0.5)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomAt(2)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button type="button" onClick={resetView} title="Centre on the active site" className="pole-map__tool-wide">
          Site
        </button>
        <button type="button" onClick={fullView} title="Show the whole 80°S polar region" className="pole-map__tool-wide">
          All
        </button>
      </div>

      <div className="pole-map__north" title="North at the active site (radially away from the pole)">
        <svg width="34" height="40" viewBox="-17 -20 34 40" aria-hidden="true">
          <g transform={`rotate(${northDeg})`}>
            <path d="M0,-16 L6,6 L0,2 L-6,6 Z" fill="currentColor" />
          </g>
          <text x={0} y={19} textAnchor="middle" fontSize="10" fill="currentColor">
            N
          </text>
        </svg>
      </div>

      <div className="pole-map__layerbox">
        <label className="pole-map__check">
          <input type="checkbox" checked={heat} onChange={showHeat} />
          Illumination heatmap
        </label>
        {heat && (
          <div className="pole-map__heatlegend">
            {heatLoading && <span className="pole-map__muted">Loading…</span>}
            {!heatLoading && !activeHeat && (
              <span className="pole-map__muted">
                {heatImages.length > 0
                  ? 'No grid for the active site; showing other sites.'
                  : 'No illumination grid available yet.'}
              </span>
            )}
            {activeHeat && (
              <>
                <span className="pole-map__badge" title="Approximation, see the notes in the data file">
                  approximate
                </span>
                <div className="pole-map__ramp" style={{ background: HEAT_GRADIENT }} />
                <div className="pole-map__ramp-labels">
                  <span>0%</span>
                  <span>{activeHeat.max}% of time Sun visible</span>
                </div>
                <div className="pole-map__muted">
                  {activeHeat.grid.nx}×{activeHeat.grid.ny} cells, {activeHeat.grid.spacingM} m
                  {activeHeat.grid.periodStart && `, ${activeHeat.grid.periodStart} to ${activeHeat.grid.periodEnd}`}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="pole-map__readout" aria-hidden="true">
        <span ref={coordRef} />
      </div>
    </div>
  )
}

export default PoleMap
