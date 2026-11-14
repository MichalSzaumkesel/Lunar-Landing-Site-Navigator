import { useCallback, useEffect, useMemo, useRef, useState, type FC, type KeyboardEvent, type MouseEvent } from 'react'
import type { Site } from '../../lib/types'
import { formatCoordDisplay, round1 } from './coords'
import { renderMarkerGlyph } from './markerGlyphs'
import './map.css'
import { PoleMap } from './PoleMap'
import { renderShading, SHADE_H, SHADE_W } from './shadingRaster'
import { useBasemap } from './useBasemap'
import {
  equirectangularProject,
  equirectangularUnproject,
  isInPolarInset,
  MAP_HEIGHT,
  MAP_WIDTH,
  POLAR_INSET_CX,
  POLAR_INSET_CY,
  POLAR_INSET_MIN_LAT,
  POLAR_INSET_RADIUS,
  polarInsetProject,
  polarInsetUnproject,
} from './projection'

export interface MoonMapShading {
  sunElevation: Float32Array
  earthElevation: Float32Array
  nLat: number
  nLon: number
}

export interface MoonMapProps {
  sites: Site[]
  selectedSiteIds: string[]
  activeSiteId: string | null
  shading: MoonMapShading | null
  terminator: Array<{ lat_deg: number; lon_deg: number }[]> | null
  onSelectSite(id: string, shiftKey?: boolean): void
  onPickPoint(lat: number, lon: number): void
  pickMode: boolean
}

function getCategoryColorVar(category: Site['category']): string {
  switch (category) {
    case 'apollo':
      return 'var(--cat-apollo)'
    case 'clps':
      return 'var(--cat-clps)'
    case 'commercial':
      return 'var(--cat-commercial)'
    case 'international':
      return 'var(--cat-international)'
    case 'artemis_region':
      return 'var(--cat-artemis_region)'
    case 'custom':
      return 'var(--cat-custom)'
    default:
      return 'var(--muted)'
  }
}

function BasemapCredit({ info }: { info: { credit: string; creditUrl: string | null } }) {
  return (
    <div className="map-credit">
      {info.creditUrl ? (
        <a href={info.creditUrl} target="_blank" rel="noreferrer">
          {info.credit}
        </a>
      ) : (
        info.credit
      )}
    </div>
  )
}

export const MoonMap: FC<MoonMapProps> = ({
  sites,
  selectedSiteIds,
  activeSiteId,
  shading,
  terminator,
  onSelectSite,
  onPickPoint,
  pickMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const imgDataRef = useRef<ImageData | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const globalBasemap = useBasemap('global')
  const poleBasemap = useBasemap('southpole')
  const activeIsPolar = useMemo(
    () => (sites.find((s) => s.id === activeSiteId)?.lat_deg ?? 0) <= -80,
    [sites, activeSiteId],
  )
  const [view, setView] = useState<'global' | 'pole'>(activeIsPolar ? 'pole' : 'global')
  const [lastPolar, setLastPolar] = useState(activeIsPolar)
  // Follow the active site: a polar site opens the south-pole map, any other site the global map
  if (lastPolar !== activeIsPolar) {
    setLastPolar(activeIsPolar)
    setView(activeIsPolar ? 'pole' : 'global')
  }

  // Redraw canvas shading only when shading changes, reusing one ImageData and canvas context
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d')
    }
    const ctx = ctxRef.current
    if (!ctx) return

    if (!shading) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    if (canvas.width !== SHADE_W || canvas.height !== SHADE_H) {
      canvas.width = SHADE_W
      canvas.height = SHADE_H
      imgDataRef.current = null
    }
    let imgData = imgDataRef.current
    if (!imgData) {
      imgData = ctx.createImageData(SHADE_W, SHADE_H)
      imgDataRef.current = imgData
    }
    renderShading(imgData.data, shading.sunElevation, shading.earthElevation, shading.nLat, shading.nLon)
    ctx.putImageData(imgData, 0, 0)
  }, [shading])

  const handleSvgClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!pickMode) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const svgX = (clientX / rect.width) * MAP_WIDTH
    const svgY = (clientY / rect.height) * MAP_HEIGHT

    let coords: { lat: number; lon: number }
    if (isInPolarInset(svgX, svgY, POLAR_INSET_CX, POLAR_INSET_CY, POLAR_INSET_RADIUS)) {
      coords = polarInsetUnproject(
        svgX,
        svgY,
        POLAR_INSET_CX,
        POLAR_INSET_CY,
        POLAR_INSET_RADIUS,
        POLAR_INSET_MIN_LAT,
      )
    } else {
      coords = equirectangularUnproject(svgX, svgY, MAP_WIDTH, MAP_HEIGHT)
    }

    const roundedLat = round1(coords.lat)
    const roundedLon = round1(coords.lon)
    onPickPoint(roundedLat, roundedLon)
  }

  const handleMarkerKeyDown = useCallback(
    (e: KeyboardEvent<SVGGElement>, siteId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelectSite(siteId)
      }
    },
    [onSelectSite],
  )

  // Graticule lines every 30 deg
  const lonTicks = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180]
  const latTicks = [90, 60, 30, 0, -30, -60, -90]

  // Sites applicable to the polar inset
  const polarSites = useMemo(
    () => sites.filter((s) => s.lat_deg <= POLAR_INSET_MIN_LAT),
    [sites],
  )

  // Memoised main map markers to avoid recomputing during shading/terminator animation
  const mainMarkers = useMemo(
    () =>
      sites.map((site) => {
        // Clamp latitude visually to [-87, 87] so markers near poles (-89.5°) aren't clipped by the SVG boundary
        const visualLat = Math.max(-87, Math.min(87, site.lat_deg))
        const { x, y } = equirectangularProject(visualLat, site.lon_deg)
        const isSelected = selectedSiteIds.includes(site.id)
        const isActive = site.id === activeSiteId
        const catColor = getCategoryColorVar(site.category)
        const label = `${site.name} (${formatCoordDisplay(site.lat_deg, site.lon_deg)})`

        return (
          <g
            key={`site-${site.id}`}
            className="map-marker"
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={isActive}
            onClick={(e) => {
              if (pickMode) return
              e.stopPropagation()
              onSelectSite(site.id, e.shiftKey)
            }}
            onKeyDown={(e) => handleMarkerKeyDown(e, site.id)}
          >
            {/* Invisible larger target for touch and easy mouse click */}
            <circle cx={x} cy={y} r={14} fill="transparent" className="map-marker__target" />
            {isSelected && (
              <circle
                cx={x}
                cy={y}
                r={8}
                className="map-marker__ring"
                style={{ stroke: isActive ? 'var(--focus)' : catColor }}
              />
            )}
            {renderMarkerGlyph({
              category: site.category,
              cx: x,
              cy: y,
              color: catColor,
              isActive,
            })}
          </g>
        )
      }),
    [sites, selectedSiteIds, activeSiteId, pickMode, onSelectSite, handleMarkerKeyDown],
  )

  // Memoised polar inset markers
  const polarMarkers = useMemo(
    () =>
      polarSites.map((site) => {
        const { x, y } = polarInsetProject(
          site.lat_deg,
          site.lon_deg,
          POLAR_INSET_CX,
          POLAR_INSET_CY,
          POLAR_INSET_RADIUS,
          POLAR_INSET_MIN_LAT,
        )
        const isSelected = selectedSiteIds.includes(site.id)
        const isActive = site.id === activeSiteId
        const catColor = getCategoryColorVar(site.category)
        const label = `Polar view: ${site.name} (${formatCoordDisplay(site.lat_deg, site.lon_deg)})`

        return (
          <g
            key={`polar-site-${site.id}`}
            className="map-marker"
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={isActive}
            onClick={(e) => {
              if (pickMode) return
              e.stopPropagation()
              onSelectSite(site.id, e.shiftKey)
            }}
            onKeyDown={(e) => handleMarkerKeyDown(e, site.id)}
          >
            <circle cx={x} cy={y} r={12} fill="transparent" className="map-marker__target" />
            {isSelected && (
              <circle
                cx={x}
                cy={y}
                r={8}
                className="map-marker__ring"
                style={{ stroke: isActive ? 'var(--focus)' : catColor }}
              />
            )}
            {renderMarkerGlyph({
              category: site.category,
              cx: x,
              cy: y,
              color: catColor,
              isActive,
            })}
          </g>
        )
      }),
    [polarSites, selectedSiteIds, activeSiteId, pickMode, onSelectSite, handleMarkerKeyDown],
  )

  if (sites.length === 0) {
    return (
      <div className="moon-map-skeleton" aria-busy="true" role="status">
        Loading Moon map…
      </div>
    )
  }

  return (
    <div className={`moon-map-viewport ${pickMode ? 'moon-map-viewport--picking' : ''}`}>
      <div className="map-viewswitch" role="group" aria-label="Map view">
        <button type="button" aria-pressed={view === 'global'} onClick={() => setView('global')}>
          Global
        </button>
        <button type="button" aria-pressed={view === 'pole'} onClick={() => setView('pole')}>
          South pole
        </button>
      </div>
      {view === 'pole' && (
        <PoleMap
          sites={sites}
          selectedSiteIds={selectedSiteIds}
          activeSiteId={activeSiteId}
          pickMode={pickMode}
          basemap={poleBasemap}
          onSelectSite={onSelectSite}
          onPickPoint={onPickPoint}
        />
      )}
      {view === 'pole' && poleBasemap?.credit && <BasemapCredit info={poleBasemap} />}
      {view === 'global' && globalBasemap && (
        <img className="moon-map-basemap" src={globalBasemap.imageUrl} alt="" aria-hidden="true" draggable={false} />
      )}
      {view === 'global' && globalBasemap?.credit && <BasemapCredit info={globalBasemap} />}
      <canvas
        ref={canvasRef}
        className="moon-map-canvas"
        aria-hidden="true"
        width={SHADE_W}
        height={SHADE_H}
        hidden={view !== 'global'}
      />
      <svg
        ref={svgRef}
        className="moon-map-svg"
        style={view !== 'global' ? { display: 'none' } : undefined}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        onClick={handleSvgClick}
        role="region"
        aria-label="2D Map of the Moon with landing sites and live illumination"
      >
        {/* Background */}
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="none" />

        {/* Graticule lines */}
        <g className="map-graticule" aria-hidden="true">
          {lonTicks.map((lon) => {
            const { x } = equirectangularProject(0, lon)
            const isPrime = lon === 0
            return (
              <line
                key={`lon-${lon}`}
                x1={x}
                y1={0}
                x2={x}
                y2={MAP_HEIGHT}
                className={`map-graticule-line ${isPrime ? 'map-graticule-line--major' : ''}`}
              />
            )
          })}
          {latTicks.map((lat) => {
            const { y } = equirectangularProject(lat, 0)
            const isEquator = lat === 0
            return (
              <line
                key={`lat-${lat}`}
                x1={0}
                y1={y}
                x2={MAP_WIDTH}
                y2={y}
                className={`map-graticule-line ${isEquator ? 'map-graticule-line--major' : ''}`}
              />
            )
          })}
        </g>

        {/* Graticule labels */}
        <g className="map-graticule-labels" aria-hidden="true">
          {/* Latitude labels along the left */}
          {latTicks
            .filter((lat) => lat !== 90 && lat !== -90)
            .map((lat) => {
              const { y } = equirectangularProject(lat, 0)
              const label = lat === 0 ? '0°' : lat > 0 ? `${lat}°N` : `${Math.abs(lat)}°S`
              return (
                <text key={`lbl-lat-${lat}`} x={8} y={y + 4} className="map-graticule-label">
                  {label}
                </text>
              )
            })}
          {/* Longitude labels along the equator */}
          {lonTicks
            .filter((lon) => lon % 60 === 0 && lon !== -180 && lon !== 180)
            .map((lon) => {
              const { x } = equirectangularProject(0, lon)
              const label = lon === 0 ? '0°' : lon > 0 ? `${lon}°E` : `${Math.abs(lon)}°W`
              return (
                <text
                  key={`lbl-lon-${lon}`}
                  x={x}
                  y={196}
                  textAnchor="middle"
                  className="map-graticule-label"
                >
                  {label}
                </text>
              )
            })}
        </g>

        {/* Terminator polylines */}
        {terminator && (
          <g className="map-terminator-layer" aria-hidden="true">
            {terminator.map((piece, i) => {
              const pointsStr = piece
                .map((pt) => {
                  const { x, y } = equirectangularProject(pt.lat_deg, pt.lon_deg)
                  return `${x.toFixed(1)},${y.toFixed(1)}`
                })
                .join(' ')
              return (
                <polyline
                  key={`terminator-${i}`}
                  points={pointsStr}
                  className="map-terminator"
                />
              )
            })}
          </g>
        )}

        {/* Main site markers */}
        <g className="map-markers-layer" role="group" aria-label="Moon sites">
          {mainMarkers}
        </g>

        {/* Polar View Inset (South Pole down to -60°) */}
        <g className="polar-inset" role="group" aria-label="South pole inset view">
          {/* Inset background disc */}
          <circle
            cx={POLAR_INSET_CX}
            cy={POLAR_INSET_CY}
            r={POLAR_INSET_RADIUS}
            className="polar-inset-bg"
          />

          {/* Concentric latitude circles: -80 and -70 */}
          {/* -80 deg: r = (10/30) * 70 = 23.33 */}
          <circle
            cx={POLAR_INSET_CX}
            cy={POLAR_INSET_CY}
            r={(10 / 30) * POLAR_INSET_RADIUS}
            className="polar-inset-grid"
          />
          {/* -70 deg: r = (20/30) * 70 = 46.67 */}
          <circle
            cx={POLAR_INSET_CX}
            cy={POLAR_INSET_CY}
            r={(20 / 30) * POLAR_INSET_RADIUS}
            className="polar-inset-grid"
          />

          {/* Radial meridian lines */}
          <line
            x1={POLAR_INSET_CX}
            y1={POLAR_INSET_CY - POLAR_INSET_RADIUS}
            x2={POLAR_INSET_CX}
            y2={POLAR_INSET_CY + POLAR_INSET_RADIUS}
            className="polar-inset-grid"
          />
          <line
            x1={POLAR_INSET_CX - POLAR_INSET_RADIUS}
            y1={POLAR_INSET_CY}
            x2={POLAR_INSET_CX + POLAR_INSET_RADIUS}
            y2={POLAR_INSET_CY}
            className="polar-inset-grid"
          />

          {/* Inset Title label */}
          <text
            x={POLAR_INSET_CX}
            y={POLAR_INSET_CY - POLAR_INSET_RADIUS + 16}
            textAnchor="middle"
            className="polar-inset-label"
          >
            Polar view
          </text>

          {/* Inset site markers */}
          {polarMarkers}
        </g>
      </svg>
    </div>
  )
}

export default MoonMap
