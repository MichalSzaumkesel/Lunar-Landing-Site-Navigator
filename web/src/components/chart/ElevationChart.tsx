import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react'
import { line, scaleLinear } from 'd3'
import { useSvgTextScale } from '../../lib/useSvgTextScale'
import { useHeldCursorKeys } from '../../lib/useHeldCursorKeys'
import type { ObserverHeightM, SiteBundle } from '../../lib/types'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { ElevationTable } from './ElevationTable'
import {
  computeElevationSeries,
  computeRangeBounds,
  earthStatusText,
  formatElevationDeg,
  sampleElevationAt,
  sunStatusText,
  type ElevationPoint,
  type RangeMode,
} from './elevationSeries'
import { formatCursorH } from '../../lib/formatHours'
import './chart.css'

const DEFAULT_VIEW_W = 600
const MIN_VIEW_W = 240
const MAX_VIEW_W = 2400
const VIEW_H = 180
const LEFT = 46
const RIGHT_MARGIN = 20
const TOP = 16
const BOTTOM = 152

export interface ElevationLineChartProps {
  series: ElevationPoint[]
  startH: number
  endH: number
  durationH: number
  cursorH: number
  cursorPoint: ElevationPoint | null
  playing: boolean
  onSeek: (h: number) => void
}

/** Pure SVG Line Chart rendered with d3 scales and paths */
export function ElevationLineChart({
  series,
  startH,
  endH,
  durationH,
  cursorH,
  cursorPoint,
  playing,
  onSeek,
}: ElevationLineChartProps): ReactElement {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const scaleRef = useSvgTextScale()
  // The viewBox follows the rendered width (1 unit = 1 px), so the plot fills its panel at any size.
  const [viewW, setViewW] = useState(DEFAULT_VIEW_W)
  const right = viewW - RIGHT_MARGIN
  useEffect(() => {
    const el = svgRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setViewW(Math.max(MIN_VIEW_W, Math.min(MAX_VIEW_W, w)))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const setSvg = useCallback(
    (el: SVGSVGElement | null) => {
      svgRef.current = el
      scaleRef(el)
    },
    [scaleRef],
  )

  // X scale mapping relative hours to SVG coordinates
  const xScale = useMemo(() => {
    const s = Number.isFinite(startH) ? startH : 0
    const e = Number.isFinite(endH) && endH > s ? endH : s + 1
    return scaleLinear().domain([s, e]).range([LEFT, right]).clamp(true)
  }, [startH, endH, right])

  // Y scale mapping clearance degrees to SVG coordinates
  const { yScale, yTicks, yZero } = useMemo(() => {
    let minDeg = 0
    let maxDeg = 0
    for (const p of series) {
      if (p.sunClearanceDeg < minDeg) minDeg = p.sunClearanceDeg
      if (p.sunClearanceDeg > maxDeg) maxDeg = p.sunClearanceDeg
      if (p.earthClearanceDeg < minDeg) minDeg = p.earthClearanceDeg
      if (p.earthClearanceDeg > maxDeg) maxDeg = p.earthClearanceDeg
    }

    // Always include the zero horizon line with at least 2 deg margin
    const domainMin = Math.floor(Math.min(-2, minDeg - 1))
    const domainMax = Math.ceil(Math.max(2, maxDeg + 1))

    const scale = scaleLinear().domain([domainMin, domainMax]).range([BOTTOM, TOP])
    const ticks = scale.ticks(5)
    if (!ticks.includes(0)) ticks.push(0)
    ticks.sort((a, b) => a - b)

    return { yScale: scale, yTicks: ticks, yZero: scale(0) }
  }, [series])

  // D3 line generators for Sun and Earth
  const sunPath = useMemo(() => {
    if (series.length === 0) return ''
    const lineGen = line<ElevationPoint>()
      .x((d) => xScale(d.relH))
      .y((d) => yScale(d.sunClearanceDeg))
    return lineGen(series) ?? ''
  }, [series, xScale, yScale])

  const earthPath = useMemo(() => {
    if (series.length === 0) return ''
    const lineGen = line<ElevationPoint>()
      .x((d) => xScale(d.relH))
      .y((d) => yScale(d.earthClearanceDeg))
    return lineGen(series) ?? ''
  }, [series, xScale, yScale])

  // X-axis ticks (4 to 6 evenly spaced time ticks)
  const xTicks = useMemo(() => {
    return xScale.ticks(5)
  }, [xScale])

  const handlePointerSeek = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return
    const svgX = ((clientX - rect.left) / rect.width) * viewW
    const clampedSvgX = Math.max(LEFT, Math.min(right, svgX))
    const h = xScale.invert(clampedSvgX)
    onSeek(Math.max(0, Math.min(durationH, h)))
  }

  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    try {
      if (typeof e.currentTarget.setPointerCapture === 'function') {
        e.currentTarget.setPointerCapture(e.pointerId)
      }
    } catch {
      // safe fallback
    }
    handlePointerSeek(e.clientX)
  }

  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    const isCaptured =
      typeof e.currentTarget.hasPointerCapture === 'function'
        ? e.currentTarget.hasPointerCapture(e.pointerId)
        : e.buttons === 1
    if (isCaptured) {
      handlePointerSeek(e.clientX)
    }
  }

  const onPointerUp = (e: PointerEvent<SVGRectElement>) => {
    try {
      if (
        typeof e.currentTarget.hasPointerCapture === 'function' &&
        e.currentTarget.hasPointerCapture(e.pointerId)
      ) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // safe fallback
    }
  }

  const held = useHeldCursorKeys({
    maxH: durationH,
    read: () => cursorH,
    write: (h) => onSeek(Math.max(0, Math.min(durationH, h))),
  })

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (held.onKeyDown(e)) return
    let delta = 0
    if (e.key === 'ArrowLeft') delta = e.shiftKey ? -6 : -1
    else if (e.key === 'ArrowRight') delta = e.shiftKey ? 6 : 1
    else if (e.key === 'Home') delta = -cursorH
    else if (e.key === 'End') delta = durationH - cursorH

    if (delta !== 0) {
      e.preventDefault()
      onSeek(Math.max(0, Math.min(durationH, cursorH + delta)))
    }
  }

  const isCursorInView = cursorH >= startH && cursorH <= endH
  const cursorX = isCursorInView ? xScale(cursorH) : null

  return (
    <svg
      ref={setSvg}
      className={`elevation-chart-svg svg-scaled ${playing ? 'is-playing' : ''}`}
      viewBox={`0 0 ${viewW} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="slider"
      aria-label="Sun and Earth elevation above the horizon over time"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationH)}
      aria-valuenow={Math.round(cursorH)}
      aria-valuetext={`Cursor at ${formatCursorH(cursorH)} hours`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={held.onKeyUp}
      onBlur={held.onBlur}
    >
      <defs>
        <clipPath id="elevation-chart-clip">
          <rect x={LEFT} y={TOP} width={right - LEFT} height={BOTTOM - TOP} />
        </clipPath>
      </defs>

      {/* Grid lines and Y axis ticks */}
      {yTicks.map((tickVal) => {
        const y = yScale(tickVal)
        if (tickVal === 0) return null // handled by zero line
        return (
          <g key={`y-${tickVal}`}>
            <line
              x1={LEFT}
              x2={right}
              y1={y}
              y2={y}
              className="chart__grid-line"
            />
            <text
              x={LEFT - 6}
              y={y + 4}
              textAnchor="end"
              className="chart__axis-text"
            >
              {tickVal > 0 ? `+${tickVal}°` : `${tickVal}°`}
            </text>
          </g>
        )
      })}

      {/* Zero line labelled "Horizon" */}
      <line
        x1={LEFT}
        x2={right}
        y1={yZero}
        y2={yZero}
        className="chart__zero-line"
      />
      <text
        x={LEFT - 6}
        y={yZero + 4}
        textAnchor="end"
        className="chart__axis-text"
      >
        0°
      </text>

      {/* X axis line and ticks */}
      <line
        x1={LEFT}
        x2={right}
        y1={BOTTOM}
        y2={BOTTOM}
        className="chart__axis-line"
      />
      {xTicks.map((tickH) => {
        const x = xScale(tickH)
        return (
          <g key={`x-${tickH}`}>
            <line
              x1={x}
              x2={x}
              y1={BOTTOM}
              y2={BOTTOM + 4}
              className="chart__axis-line"
            />
            <text
              x={x}
              y={BOTTOM + 16}
              textAnchor="middle"
              className="chart__axis-text"
            >
              {`+${Math.round(tickH)} h`}
            </text>
          </g>
        )
      })}

      {/* Sun and Earth elevation series curves clipped to plot area */}
      <g clipPath="url(#elevation-chart-clip)">
        {earthPath && (
          <path
            d={earthPath}
            className="chart__line chart__line--earth"
            aria-label="Earth elevation above horizon line"
          />
        )}
        {sunPath && (
          <path
            d={sunPath}
            className="chart__line chart__line--sun"
            aria-label="Sun elevation above horizon line"
          />
        )}
      </g>

      {/* Drawn after the curves so they never paint over it */}
      <text
        x={LEFT + 6}
        y={yZero - 5}
        className="chart__zero-label"
      >
        Horizon
      </text>

      {/* Cursor vertical indicator and point highlights */}
      {cursorX !== null && (
        <g clipPath="url(#elevation-chart-clip)">
          <line
            x1={cursorX}
            x2={cursorX}
            y1={TOP}
            y2={BOTTOM}
            className="chart__cursor-line"
          />
          {cursorPoint && (
            <>
              <circle
                cx={cursorX}
                cy={yScale(cursorPoint.earthClearanceDeg)}
                r="4.5"
                className="chart__cursor-point chart__cursor-point--earth"
              />
              <circle
                cx={cursorX}
                cy={yScale(cursorPoint.sunClearanceDeg)}
                r="4.5"
                className="chart__cursor-point chart__cursor-point--sun"
              />
            </>
          )}
        </g>
      )}

      {/* Transparent interactive rect capturing click and drag */}
      <rect
        x={LEFT}
        y={TOP}
        width={right - LEFT}
        height={BOTTOM - TOP}
        fill="transparent"
        className="chart__overlay-interactive"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </svg>
  )
}

export interface ElevationChartProps {
  scenario: Scenario
  bundle: SiteBundle | null
  heightM: ObserverHeightM
}

/**
 * Top-level ElevationChart component for the Metrics area:
 * Includes header, range controls (24 h / 7 d / window), table toggle,
 * d3 chart with "Horizon" zero line, click/drag cursor setting, and accessible table.
 */
export function ElevationChart({
  scenario,
  bundle,
  heightM,
}: ElevationChartProps): ReactElement {
  const [rangeMode, setRangeMode] = useState<RangeMode>('window')
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')

  const cursorH = useAppStore((s) => s.cursorH)
  const setCursorH = useAppStore((s) => s.setCursorH)
  const playing = useAppStore((s) => s.playing)
  const setPlaying = useAppStore((s) => s.setPlaying)

  const { startMs, endMs } = scenarioWindowMs(scenario)
  const durationH = Math.max(1, (endMs - startMs) / 3_600_000)

  // Avoid per-frame recomputation of range during play by anchoring to integer hour
  const anchorH = playing ? Math.floor(cursorH) : cursorH
  const { startH, endH } = useMemo(
    () => computeRangeBounds(anchorH, durationH, rangeMode),
    [anchorH, durationH, rangeMode],
  )

  // Compute elevation series for current view range
  const series = useMemo(() => {
    if (!bundle) return []
    return computeElevationSeries(bundle, heightM, startMs, startH, endH)
  }, [bundle, heightM, startMs, startH, endH])

  // Current values at the exact cursor position
  const cursorMs = scenarioCursorMs(scenario, cursorH)
  const cursorPoint = useMemo(() => {
    if (!bundle) return null
    return sampleElevationAt(bundle, heightM, cursorMs, startMs)
  }, [bundle, heightM, cursorMs, startMs])

  const handleSeek = (h: number) => {
    if (playing) setPlaying(false)
    setCursorH(h)
  }

  if (!bundle) {
    return (
      <section
        className="elevation-section elevation-section--loading"
        aria-busy="true"
        aria-label="Loading elevation chart"
      >
        <p>Loading Sun and Earth elevation data…</p>
      </section>
    )
  }

  if (series.length === 0) {
    return (
      <section
        className="elevation-section elevation-section--empty"
        role="status"
        aria-label="Elevation data outside range"
      >
        <p>Elevation data unavailable for selected range.</p>
      </section>
    )
  }

  return (
    <section
      className="elevation-section"
      aria-label="Sun and Earth elevation above the horizon over time"
    >
      <header className="elevation-section__header">
        <h3 className="elevation-section__title">
          Sun and Earth elevation above the horizon over time
        </h3>

        <div className="elevation-section__controls">
          <div
            className="elevation-section__btn-group"
            role="group"
            aria-label="Elevation chart time range"
          >
            <button
              type="button"
              className="elevation-section__btn"
              aria-pressed={rangeMode === '24h'}
              onClick={() => setRangeMode('24h')}
              title="Focus 24-hour range centered around cursor"
            >
              24 h
            </button>
            <button
              type="button"
              className="elevation-section__btn"
              aria-pressed={rangeMode === '7d'}
              onClick={() => setRangeMode('7d')}
              title="Focus 7-day range centered around cursor"
            >
              7 d
            </button>
            <button
              type="button"
              className="elevation-section__btn"
              aria-pressed={rangeMode === 'window'}
              onClick={() => setRangeMode('window')}
              title="Show entire scenario window"
            >
              Window
            </button>
          </div>

          <button
            type="button"
            className="elevation-section__toggle-btn"
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode((m) => (m === 'chart' ? 'table' : 'chart'))}
            title={
              viewMode === 'table'
                ? 'Switch to graphic elevation chart'
                : 'Switch to accessible tabular elevation data'
            }
          >
            {viewMode === 'table' ? 'Chart' : 'Table'}
          </button>
        </div>
      </header>

      {/* Readout bar with contract wording */}
      <div className="elevation-section__readouts" aria-label="Current elevation readouts">
        <span className="elevation-section__readout-item">
          <span
            className="elevation-section__swatch elevation-section__swatch--sun"
            aria-hidden="true"
          />
          <strong>Sun:</strong>{' '}
          {cursorPoint ? formatElevationDeg(cursorPoint.sunClearanceDeg) : '—'}{' '}
          ({cursorPoint ? sunStatusText(cursorPoint.sunVisible) : 'Sun below horizon'})
        </span>

        <span className="elevation-section__readout-item">
          <span
            className="elevation-section__swatch elevation-section__swatch--earth"
            aria-hidden="true"
          />
          <strong>Earth:</strong>{' '}
          {cursorPoint ? formatElevationDeg(cursorPoint.earthClearanceDeg) : '—'}{' '}
          ({cursorPoint ? earthStatusText(cursorPoint.earthVisible) : 'Earth below horizon'})
        </span>

        <span className="elevation-section__readout-item">
          <span
            className="elevation-section__swatch elevation-section__swatch--horizon"
            aria-hidden="true"
          />
          <span style={{ color: 'var(--muted, #a3afc7)' }}>Horizon (0°)</span>
        </span>
      </div>

      {viewMode === 'table' ? (
        <ElevationTable
          series={series}
          cursorH={cursorH}
          onSelectHour={handleSeek}
        />
      ) : (
        <ElevationLineChart
          series={series}
          startH={startH}
          endH={endH}
          durationH={durationH}
          cursorH={cursorH}
          cursorPoint={cursorPoint}
          playing={playing}
          onSeek={handleSeek}
        />
      )}
    </section>
  )
}
