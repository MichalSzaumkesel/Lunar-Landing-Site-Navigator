import { useMemo } from 'react'
import type { ReactElement } from 'react'
import type { ObserverHeightM, SiteBundle } from '../../lib/types'
import { sampleAt } from '../../lib/ephem'
import {
  CENTER,
  RIM_R,
  VIEW_SIZE,
  buildSkyModel,
  polarToXY,
} from '../sky/geometry'

export interface PrintSkyPlotProps {
  bundle: SiteBundle | null
  observerHeightM: ObserverHeightM
  startMs: number
  endMs: number
  cursorMs: number
  className?: string
  size?: number
}

const CARDINALS = [
  { az: 0, label: 'N', dx: 0, dy: -14 },
  { az: 90, label: 'E', dx: 18, dy: 5 },
  { az: 180, label: 'S', dx: 0, dy: 22 },
  { az: 270, label: 'W', dx: -18, dy: 5 },
]

export function PrintSkyPlot({
  bundle,
  observerHeightM,
  startMs,
  endMs,
  cursorMs,
  className = '',
  size = 140,
}: PrintSkyPlotProps): ReactElement {
  const model = useMemo(() => {
    if (!bundle) return null
    return buildSkyModel(bundle, observerHeightM, startMs, endMs)
  }, [bundle, observerHeightM, startMs, endMs])

  const sample = useMemo(() => {
    if (!bundle?.ephem) return null
    return sampleAt(bundle.ephem, cursorMs)
  }, [bundle, cursorMs])

  if (!bundle || !model) {
    return (
      <svg
        className={`print-sky-plot print-sky-plot--empty ${className}`.trim()}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        width={size}
        height={size}
        role="img"
        aria-label="Sky plot unavailable"
      >
        <circle cx={CENTER} cy={CENTER} r={RIM_R} fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
        <text
          x={CENTER}
          y={CENTER}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#64748b"
          fontSize="24"
        >
          No sky data
        </text>
      </svg>
    )
  }

  const sunPos = sample
    ? polarToXY(sample.sun.az, Math.max(0, sample.sun.el), model.zoomEl, RIM_R, CENTER, CENTER)
    : null
  const earthPos = sample
    ? polarToXY(sample.earth.az, Math.max(0, sample.earth.el), model.zoomEl, RIM_R, CENTER, CENTER)
    : null

  const isSunAbove = sample ? sample.sun.el >= 0 : false
  const isEarthAbove = sample ? sample.earth.el >= 0 : false

  return (
    <svg
      className={`print-sky-plot ${className}`.trim()}
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      width={size}
      height={size}
      role="img"
      aria-label="Static polar sky plot showing terrain horizon, Sun track and Earth track"
    >
      {/* Background base */}
      <circle cx={CENTER} cy={CENTER} r={RIM_R} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />

      {/* Elevation rings */}
      {model.rings.map((ring) => (
        <circle
          key={ring.el}
          cx={CENTER}
          cy={CENTER}
          r={ring.r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="1.2"
        />
      ))}

      {/* Radial spokes */}
      <g transform={`translate(${CENTER}, ${CENTER})`}>
        <path d={model.spokesPath} stroke="#e2e8f0" strokeWidth="1" fill="none" />
      </g>

      {/* Tracks */}
      <g transform={`translate(${CENTER}, ${CENTER})`}>
        {/* Earth track: dashed blue */}
        <path
          d={model.earthTrackPath}
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeDasharray="6 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Sun track: solid amber */}
        <path
          d={model.sunTrackPath}
          stroke="#d97706"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* Terrain polygon and horizon line */}
      <g transform={`translate(${CENTER}, ${CENTER})`}>
        <path d={model.terrainPath} fill="#f1f5f9" fillRule="evenodd" />
        <path d={model.horizonPath} stroke="#334155" strokeWidth="2" fill="none" />
        <circle r={RIM_R} stroke="#475569" strokeWidth="2" fill="none" />
      </g>

      {/* Ring elevation labels */}
      {model.rings.map((ring) => {
        const p = polarToXY(45, ring.el, model.zoomEl, RIM_R, CENTER, CENTER)
        return (
          <text
            key={ring.el}
            x={p.x + 4}
            y={p.y - 4}
            fill="#64748b"
            fontSize="16"
            fontFamily="sans-serif"
          >
            {ring.el}°
          </text>
        )
      })}

      {/* Cardinal labels */}
      {CARDINALS.map(({ az, label, dx, dy }) => {
        const p = polarToXY(az, 0, 1, RIM_R, CENTER, CENTER)
        return (
          <text
            key={label}
            x={p.x + dx}
            y={p.y + dy}
            fill="#0f172a"
            fontSize="22"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="sans-serif"
          >
            {label}
          </text>
        )
      })}

      {/* Earth marker (blue square with white cross) */}
      {earthPos && (
        <g>
          <rect
            x={earthPos.x - 8}
            y={earthPos.y - 8}
            width={16}
            height={16}
            fill={isEarthAbove ? '#2563eb' : '#94a3b8'}
            stroke="#000000"
            strokeWidth="2"
          />
          <line
            x1={earthPos.x - 5}
            y1={earthPos.y}
            x2={earthPos.x + 5}
            y2={earthPos.y}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <line
            x1={earthPos.x}
            y1={earthPos.y - 5}
            x2={earthPos.x}
            y2={earthPos.y + 5}
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <text
            x={earthPos.x + 12}
            y={earthPos.y + 5}
            fill="#1e293b"
            fontSize="16"
            fontWeight="600"
            fontFamily="sans-serif"
          >
            Earth
          </text>
        </g>
      )}

      {/* Sun marker (amber circle with centre dot) */}
      {sunPos && (
        <g>
          <circle
            cx={sunPos.x}
            cy={sunPos.y}
            r={9}
            fill={isSunAbove ? '#f59e0b' : '#94a3b8'}
            stroke="#000000"
            strokeWidth="2"
          />
          <circle cx={sunPos.x} cy={sunPos.y} r={2.5} fill="#000000" />
          <text
            x={sunPos.x + 12}
            y={sunPos.y + 5}
            fill="#1e293b"
            fontSize="16"
            fontWeight="600"
            fontFamily="sans-serif"
          >
            Sun
          </text>
        </g>
      )}
    </svg>
  )
}
