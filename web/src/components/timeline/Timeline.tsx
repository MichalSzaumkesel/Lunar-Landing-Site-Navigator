import { memo, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { HOUR_MS } from '../../config/dataRange'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { clampStartUtc } from '../scenario/cardLogic'
import {
  clampMissionStartH,
  evaluateMissionRulesAt,
  missionKeyStepH,
} from './missionBar'
import {
  NO_DATA,
  ON,
  computeBandRuns,
  dayTicks,
  formatDayLabel,
  formatUtcMinute,
  hoursFromX,
  keyStepH,
  labelStride,
  xFromHours,
} from './runs'
import type { BandRuns, Run } from './runs'
import { useElementWidth } from './useElementWidth'
import './timeline.css'

// Layout in CSS pixels; the svg is drawn at its real size so text stays readable.
const LEFT = 112
const RIGHT = 22 // room for half a centred date label at the window end
const TOP = 12
const BAND_H = 16
const BAND_GAP = 6
const AXIS_H = 38
const BANDS_H = 3 * BAND_H + 2 * BAND_GAP
const MISSION_H = 20
const MISSION_GAP = 8
const DEFAULT_WIDTH = 600
const MIN_WIDTH = 280

const BANDS = [
  { key: 'sun', label: 'Sun visible', cls: 'tl__on--sun' },
  { key: 'earth', label: 'Earth in view', cls: 'tl__on--earth' },
  { key: 'both', label: 'Both', cls: 'tl__on--both' },
] as const

const bandY = (i: number) => TOP + i * (BAND_H + BAND_GAP)
const r2 = (v: number) => Math.round(v * 100) / 100

interface BandsProps {
  runs: BandRuns
  width: number
  durationH: number
  startMs: number
  hatchId: string
  missionOffsetH?: number
}

// Static layer: only redraws when data, window or width change, not with the cursor.
const TimelineBands = memo(function TimelineBands({
  runs,
  width,
  durationH,
  startMs,
  hatchId,
  missionOffsetH = 0,
}: BandsProps) {
  const plotW = width - LEFT - RIGHT
  const pxPerH = durationH > 0 ? plotW / durationH : 0
  const endMs = startMs + durationH * HOUR_MS
  const ticks = dayTicks(startMs, endMs)
  const pxPerDay = pxPerH * 24
  const stride = labelStride(pxPerDay)
  const bandsBottom = TOP + BANDS_H + missionOffsetH
  const axisY = bandsBottom + 6

  const rect = (run: Run, y: number, cls: string, fill?: string, key?: string) => (
    <rect
      key={key ?? `${run.start}`}
      className={cls}
      x={r2(LEFT + run.start * pxPerH)}
      y={y}
      width={r2((run.end - run.start) * pxPerH)}
      height={BAND_H}
      fill={fill}
    />
  )

  return (
    <g>
      {BANDS.map((band, i) => {
        const y = bandY(i)
        const list = runs[band.key]
        const noData = list.filter((r) => r.state === NO_DATA)
        const widest = noData.reduce<Run | null>(
          (m, r) => (!m || r.end - r.start > m.end - m.start ? r : m),
          null,
        )
        const widestPx = widest ? (widest.end - widest.start) * pxPerH : 0
        return (
          <g key={band.key}>
            <text className="tl__label" x={LEFT - 10} y={y + BAND_H / 2} textAnchor="end">
              {band.label}
            </text>
            <rect className="tl__off" x={LEFT} y={y} width={plotW} height={BAND_H} rx={2} />
            {list.filter((r) => r.state === ON).map((r) => rect(r, y, `tl__on ${band.cls}`))}
            {noData.map((r) => rect(r, y, 'tl__nodata', `url(#${hatchId})`))}
            {i === 0 && widest && widestPx >= 72 && (
              <text
                className="tl__nodata-label"
                x={r2(LEFT + widest.start * pxPerH + widestPx / 2)}
                y={y + BAND_H / 2}
                textAnchor="middle"
              >
                no data
              </text>
            )}
          </g>
        )
      })}

      <g className="tl__axis">
        <line x1={LEFT} x2={LEFT + plotW} y1={axisY} y2={axisY} />
        {ticks.map((t, i) => {
          const x = r2(LEFT + ((t - startMs) / HOUR_MS) * pxPerH)
          const labelled = i % stride === 0
          if (!labelled && pxPerDay < 4) return null
          return (
            <g key={t}>
              {labelled && <line className="tl__grid" x1={x} x2={x} y1={TOP} y2={bandsBottom} />}
              <line x1={x} x2={x} y1={axisY} y2={axisY + (labelled ? 6 : 3)} />
              {labelled && (
                <text className="tl__tick" x={x} y={axisY + 21} textAnchor="middle">
                  {formatDayLabel(t)}
                </text>
              )}
            </g>
          )
        })}
      </g>

      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className="tl__hatch-bg" />
          <line x1="0" y1="0" x2="0" y2="6" className="tl__hatch-line" />
        </pattern>
      </defs>
    </g>
  )
})

function TimelineView({ scenario }: { scenario: Scenario }) {
  const { status, bundle, error } = useSiteBundle(scenario.siteId)
  const heightM = useAppStore((s) => s.observerHeightM)
  const cursorH = useAppStore((s) => s.cursorH)
  const setCursorH = useAppStore((s) => s.setCursorH)
  const setPlaying = useAppStore((s) => s.setPlaying)
  const updateScenario = useAppStore((s) => s.updateScenario)
  const scenarioCount = useAppStore((s) => s.scenarios.length)
  const missionRules = useAppStore((s) => s.missionRules)

  const [boxRef, measured] = useElementWidth<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const hatchId = 'tl-hatch-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const failHatchId = 'tl-fail-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')

  // The bar can be hidden with a small toggle, hidden by default on boards of 3 or more cards.
  const [showMissionBar, setShowMissionBar] = useState(() => scenarioCount < 3)
  const [prevCount, setPrevCount] = useState(scenarioCount)
  if (prevCount !== scenarioCount) {
    setPrevCount(scenarioCount)
    if (scenarioCount >= 3 && prevCount < 3) {
      setShowMissionBar(false)
    }
  }

  const [startH, setStartH] = useState(0)
  const [applyOnRelease, setApplyOnRelease] = useState(false)
  const dragMissionRef = useRef<{
    pointerId: number
    startX: number
    initialH: number
  } | null>(null)

  const { startMs } = scenarioWindowMs(scenario)
  const durationH = scenario.durationH
  const width = Math.max(MIN_WIDTH, measured || DEFAULT_WIDTH)
  const plotW = width - LEFT - RIGHT

  const clampedStartH = clampMissionStartH(
    startH,
    durationH,
    missionRules.missionDurationH,
  )
  const landingMs = startMs + clampedStartH * HOUR_MS
  const maxStartH = Math.max(0, durationH - missionRules.missionDurationH)

  const effectiveRules = useMemo(
    () => ({ ...missionRules, observerHeightM: heightM }),
    [missionRules, heightM],
  )

  const evalRes = useMemo(
    () => (bundle ? evaluateMissionRulesAt(bundle, effectiveRules, landingMs) : null),
    [bundle, effectiveRules, landingMs],
  )

  const applyLandingDate = () => {
    const landingDay = new Date(landingMs).toISOString().slice(0, 10)
    const clamped = clampStartUtc(landingDay, durationH)
    if (clamped) {
      updateScenario(scenario.id, { startUtc: clamped, slipDays: 0 })
      setStartH(0)
    }
  }

  // Once per bundle, observer height and window; the cursor never recomputes it.
  const runs = useMemo(
    () => (bundle ? computeBandRuns(bundle, heightM, startMs, durationH) : null),
    [bundle, heightM, startMs, durationH],
  )

  const seek = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const x = clientX - svg.getBoundingClientRect().left
    setCursorH(hoursFromX(x, LEFT, plotW, durationH))
  }

  const onPointerDown = (e: PointerEvent<SVGRectElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setPlaying(false)
    seek(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<SVGRectElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e.clientX)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = keyStepH(e.key, e.shiftKey)
    if (step === null) return
    e.preventDefault()
    setPlaying(false)
    const current = Math.min(useAppStore.getState().cursorH, durationH)
    setCursorH(Math.min(durationH, Math.max(0, current + step)))
  }

  const onMissionPointerDown = (e: PointerEvent<SVGGElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragMissionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      initialH: clampedStartH,
    }
  }

  const onMissionPointerMove = (e: PointerEvent<SVGGElement>) => {
    if (!dragMissionRef.current || dragMissionRef.current.pointerId !== e.pointerId) return
    e.stopPropagation()
    const dx = e.clientX - dragMissionRef.current.startX
    const deltaH = (dx / plotW) * durationH
    const nextH = clampMissionStartH(
      dragMissionRef.current.initialH + deltaH,
      durationH,
      missionRules.missionDurationH,
    )
    setStartH(nextH)
  }

  const onMissionPointerUp = (e: PointerEvent<SVGGElement>) => {
    if (dragMissionRef.current && dragMissionRef.current.pointerId === e.pointerId) {
      e.stopPropagation()
      dragMissionRef.current = null
      if (applyOnRelease) {
        applyLandingDate()
      }
    }
  }

  const onMissionKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    const step = missionKeyStepH(e.key, e.shiftKey)
    if (step === null) return
    e.preventDefault()
    e.stopPropagation()
    const nextH = clampMissionStartH(
      clampedStartH + step,
      durationH,
      missionRules.missionDurationH,
    )
    setStartH(nextH)
  }

  const missionOffsetH = showMissionBar ? MISSION_H + MISSION_GAP : 0
  const height = TOP + BANDS_H + missionOffsetH + AXIS_H
  const missionY = TOP + BANDS_H + MISSION_GAP
  const barX = r2(LEFT + (clampedStartH / durationH) * plotW)
  const barW = r2(Math.max(4, Math.min(plotW, (missionRules.missionDurationH / durationH) * plotW)))
  const textInside = barW >= 140

  let body
  if (status === 'error') {
    body = <div className="tl__message tl__message--error">{error ?? 'Failed to load site data'}</div>
  } else if (status === 'loading' || !runs) {
    body = <div className="tl__skeleton" aria-busy="true" aria-label="Loading timeline" />
  } else {
    const cursorX = xFromHours(cursorH, LEFT, plotW, durationH)
    const shownH = Math.min(cursorH, durationH)
    body = (
      <div>
        <div className="tl__toolbar" role="region" aria-label="Mission bar controls">
          <button
            type="button"
            className="ghost tl__toggle"
            onClick={() => setShowMissionBar((v) => !v)}
            aria-pressed={showMissionBar}
            aria-label={showMissionBar ? 'Hide mission bar' : 'Show mission bar'}
          >
            {showMissionBar ? 'Hide mission bar' : 'Show mission bar'}
          </button>
          {showMissionBar && evalRes && (
            <div className="tl__mission-info">
              <span className="tl__mission-utc" title={`Mission start UTC: ${formatUtcMinute(landingMs)}`}>
                Start: <strong>{formatUtcMinute(landingMs)}</strong>
              </span>
              <span className={`tl__badge tl__badge--${evalRes.color}`} title={evalRes.text}>
                <span className="tl__badge-symbol" aria-hidden="true">
                  {evalRes.valid ? '✓' : '⚠'}
                </span>
                <span>
                  {evalRes.label}
                  {evalRes.failingRule ? `: ${evalRes.failingRule}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="ghost tl__apply-btn"
                onClick={applyLandingDate}
                title="Set scenario start to this mission start date"
              >
                Set as landing date
              </button>
              <label className="tl__release-check" title="Apply as landing date when releasing the dragged bar">
                <input
                  type="checkbox"
                  checked={applyOnRelease}
                  onChange={(e) => setApplyOnRelease(e.target.checked)}
                />
                <span>Apply on release</span>
              </label>
            </div>
          )}
        </div>

        <div
          className="tl__focus"
          tabIndex={0}
          role="slider"
          aria-label={`Time cursor, ${bundle?.site.name ?? scenario.siteId}`}
          aria-valuemin={0}
          aria-valuemax={durationH}
          aria-valuenow={Math.round(shownH * 10) / 10}
          aria-valuetext={`${formatUtcMinute(startMs + shownH * HOUR_MS)}, ${shownH.toFixed(1)} h from window start`}
          onKeyDown={onKeyDown}
        >
          <svg ref={svgRef} className="tl__svg" width={width} height={height} aria-hidden="true">
            <TimelineBands
              runs={runs}
              width={width}
              durationH={durationH}
              startMs={startMs}
              hatchId={hatchId}
              missionOffsetH={missionOffsetH}
            />

            <g className="tl__cursor">
              <line x1={cursorX} x2={cursorX} y1={TOP - 4} y2={TOP + BANDS_H + missionOffsetH + 4} />
              <polygon points={`${cursorX - 5},${TOP - 8} ${cursorX + 5},${TOP - 8} ${cursorX},${TOP - 1}`} />
            </g>

            {/* Seek drag hit area covering the tracks */}
            <rect
              className="tl__hit"
              x={LEFT}
              y={0}
              width={plotW}
              height={height}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
            />

            {/* Mission bar layer rendered above hit area to receive pointer capture and keyboard events */}
            {showMissionBar && evalRes && (
              <g className="tl__mission-layer">
                <text className="tl__label" x={LEFT - 10} y={missionY + MISSION_H / 2} textAnchor="end">
                  Mission
                </text>
                <rect className="tl__off" x={LEFT} y={missionY} width={plotW} height={MISSION_H} rx={3} />
                <g
                  className={`tl__bar-group tl__bar-group--${evalRes.color}`}
                  tabIndex={0}
                  role="slider"
                  aria-label={`Mission bar, ${bundle?.site.name ?? scenario.siteId}`}
                  aria-valuemin={0}
                  aria-valuemax={maxStartH}
                  aria-valuenow={Math.round(clampedStartH * 10) / 10}
                  aria-valuetext={`${formatUtcMinute(landingMs)}, ${evalRes.label}${evalRes.failingRule ? `: ${evalRes.failingRule}` : ''}`}
                  onPointerDown={onMissionPointerDown}
                  onPointerMove={onMissionPointerMove}
                  onPointerUp={onMissionPointerUp}
                  onPointerCancel={onMissionPointerUp}
                  onKeyDown={onMissionKeyDown}
                >
                  <title>{`${formatUtcMinute(landingMs)} · ${evalRes.text}`}</title>
                  <rect
                    className={`tl__bar tl__bar--${evalRes.color}`}
                    x={barX}
                    y={missionY}
                    width={barW}
                    height={MISSION_H}
                    rx={3}
                    fill={evalRes.valid ? 'var(--both)' : `url(#${failHatchId})`}
                  />
                  {evalRes.valid ? (
                    <path
                      className="tl__bar-icon tl__bar-icon--pass"
                      d={`M${barX + 6} ${missionY + 10} l3 3 l5 -6`}
                      fill="none"
                      stroke="#0c1017"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      className="tl__bar-icon tl__bar-icon--fail"
                      d={`M${barX + 11} ${missionY + 4} l5 12 h-10 Z`}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth="1"
                    />
                  )}
                  <text
                    className={`tl__bar-label tl__bar-label--${evalRes.color}`}
                    x={textInside ? barX + 22 : barX + barW + 8 > LEFT + plotW - 60 ? barX - 8 : barX + barW + 8}
                    y={missionY + MISSION_H / 2}
                    textAnchor={textInside ? 'start' : barX + barW + 8 > LEFT + plotW - 60 ? 'end' : 'start'}
                    dominantBaseline="central"
                  >
                    {evalRes.label}{evalRes.failingRule ? `: ${evalRes.failingRule}` : ''}
                  </text>
                </g>
                <defs>
                  <pattern id={failHatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="8" height="8" fill="#581c1c" />
                    <line x1="0" y1="0" x2="0" y2="8" stroke="#ef4444" strokeWidth="2.5" />
                  </pattern>
                </defs>
              </g>
            )}
          </svg>
        </div>
      </div>
    )
  }

  return (
    <div className="tl" ref={boxRef} data-tour="timeline">
      {body}
    </div>
  )
}

export function Timeline({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <TimelineView scenario={scenario} />
}
