import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { LandingWindow, SiteBundle } from '../../lib/types'
import { windowsFromRow } from '../../lib/windowMap'
import type { WindowMapRow } from '../../lib/windowMap'
import * as windowMapClient from '../../lib/windowMapClient'
import { dataSource } from '../../lib/loader'
import { parseCustomSiteId } from '../../lib/customSite'
import { useAppStore } from '../../state/store'
import { MissionRulesForm } from './MissionRulesForm'
import {
  cellFromPointer,
  formatCellAnnouncement,
  formatDateIso,
  formatDateUtc,
  formatLandingWindow,
  formatRuleSummary,
  getBestSiteSentence,
  getCellColor,
  getMonthTicks,
  customSiteIdsFromScenarios,
  siteRowLabel,
  isHatch,
  moveHighlight,
  slipBufferH,
} from './windowMapView'
import './finder.css'

export interface WindowMapProps {
  className?: string
}

const ROW_HEIGHT = 28
const LABEL_COL_WIDTH = 260
const BATCH_SIZE = 3

export function WindowMap({ className = '' }: WindowMapProps) {
  // Store values
  const missionRules = useAppStore((s) => s.missionRules)
  const observerHeightM = useAppStore((s) => s.observerHeightM)
  // Joined string keeps the selector stable while Play moves the cursor.
  const customIdsKey = useAppStore((s) => customSiteIdsFromScenarios(s.scenarios).join(','))
  const addScenario = useAppStore((s) => s.addScenario)
  const updateScenario = useAppStore((s) => s.updateScenario)

  // Loading state
  const [retryKey, setRetryKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadedCount, setLoadedCount] = useState(0)
  const [totalSites, setTotalSites] = useState(0)
  const [bundles, setBundles] = useState<SiteBundle[]>([])
  const [failedSites, setFailedSites] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // Window map computation state
  const [rows, setRows] = useState<WindowMapRow[]>([])

  // User interactions
  const [hoveredCell, setHoveredCell] = useState<{ rowIndex: number; colIndex: number } | null>(null)
  const [keyboardHighlight, setKeyboardHighlight] = useState<{ rowIndex: number; colIndex: number } | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string>('')

  // Sizing
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(800)

  // Measure container width
  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    setContainerWidth(Math.round(el.getBoundingClientRect().width))

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) {
        setContainerWidth(Math.round(w))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Lazy sequential batch loading of sites in batches of 3
  useEffect(() => {
    let active = true

    async function loadData() {
      try {
        const sitesFile = await dataSource.loadSites()
        if (!active) return

        // Custom sites used by scenarios join the grid as approximate rows.
        const customSites = customIdsKey
          ? customIdsKey.split(',').flatMap((id) => {
              const c = parseCustomSiteId(id)
              return c ? [{ id, name: id }] : []
            })
          : []
        const curatedSites = [
          ...sitesFile.sites.filter((s) => s.category !== 'custom'),
          ...customSites,
        ]
        if (curatedSites.length === 0) {
          setLoading(false)
          return
        }

        setTotalSites(curatedSites.length)
        const loaded: SiteBundle[] = []
        const failed: string[] = []

        for (let i = 0; i < curatedSites.length; i += BATCH_SIZE) {
          if (!active) return
          const chunk = curatedSites.slice(i, i + BATCH_SIZE)
          const results = await Promise.allSettled(chunk.map((s) => dataSource.loadSite(s.id)))
          if (!active) return

          for (let j = 0; j < results.length; j++) {
            const res = results[j]
            const site = chunk[j]
            if (res.status === 'fulfilled') {
              loaded.push(res.value)
            } else {
              failed.push(site.name || site.id)
            }
          }

          setLoadedCount(Math.min(curatedSites.length, i + chunk.length))
          setBundles([...loaded])
          setFailedSites([...failed])
        }

        setLoading(false)
      } catch (err: unknown) {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Could not load site data.')
        setLoading(false)
      }
    }

    void loadData()

    return () => {
      active = false
    }
  }, [retryKey, customIdsKey])

  function handleRetry() {
    setLoading(true)
    setLoadError(null)
    setLoadedCount(0)
    setBundles([])
    setFailedSites([])
    setRetryKey((k) => k + 1)
  }

  const [siteWindows, setSiteWindows] = useState<Map<string, LandingWindow[]> | null>(null)

  // Compute window map whenever bundles, rules, or observer height change (debounced 250 ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (bundles.length === 0) {
        setRows([])
        return
      }

      const inputs = bundles.map((b) => ({
        siteId: b.site.id,
        bundle: { horizon: b.horizon, ephem: b.ephem },
      }))

      windowMapClient.computeWindowMapAsync(inputs, { ...missionRules, observerHeightM }, { dayStepH: 24 })
        .then((computedRows) => {
          setRows(computedRows)
          // Hourly pass for the window lists, in the worker: findWindows would block the page for seconds.
          return windowMapClient.computeWindowMapAsync(inputs, { ...missionRules, observerHeightM }, { dayStepH: 1 })
        })
        .then((hourlyRows) => {
          setSiteWindows(new Map(hourlyRows.map((r) => [r.siteId, windowsFromRow(r)])))
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.message === 'cancelled') {
            return
          }
          // Non-cancellation errors handled silently or logged
        })
    }, 250)

    return () => {
      clearTimeout(timer)
      try {
        if (
          'cancelWindowMap' in windowMapClient &&
          typeof windowMapClient.cancelWindowMap === 'function'
        ) {
          windowMapClient.cancelWindowMap()
        }
      } catch {
        // Ignored when module is mocked without cancelWindowMap in unit tests
      }
    }
  }, [bundles, missionRules, observerHeightM])

  // Dimensions
  const rowCount = bundles.length
  const colCount = rows[0]?.count ?? 760
  const availableGridWidth = Math.max(100, containerWidth - LABEL_COL_WIDTH)
  const canvasWidth = Math.max(colCount, availableGridWidth)
  const canvasHeight = rowCount * ROW_HEIGHT
  const colWidth = colCount > 0 ? canvasWidth / colCount : 1

  // Draw grid on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || rowCount === 0 || colCount === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(canvasWidth * dpr)
    canvas.height = Math.round(canvasHeight * dpr)
    canvas.style.width = `${canvasWidth}px`
    canvas.style.height = `${canvasHeight}px`

    ctx.save()
    ctx.scale(dpr, dpr)

    // Create repeating hatch pattern for out-of-coverage (255)
    const hatchCanvas = document.createElement('canvas')
    hatchCanvas.width = 8
    hatchCanvas.height = 8
    const hctx = hatchCanvas.getContext('2d')
    if (hctx) {
      hctx.fillStyle = '#161d2e'
      hctx.fillRect(0, 0, 8, 8)
      hctx.strokeStyle = '#2a3550'
      hctx.lineWidth = 1.5
      hctx.beginPath()
      hctx.moveTo(0, 8)
      hctx.lineTo(8, 0)
      hctx.stroke()
    }
    const hatchPattern = ctx.createPattern(hatchCanvas, 'repeat')

    // Draw cells
    for (let r = 0; r < rowCount; r++) {
      const row = rows[r]
      const y = r * ROW_HEIGHT

      if (!row) {
        ctx.fillStyle = '#0f1420'
        ctx.fillRect(0, y, canvasWidth, ROW_HEIGHT)
      } else {
        for (let c = 0; c < colCount; c++) {
          const x = Math.floor(c * colWidth)
          const nextX = Math.floor((c + 1) * colWidth)
          const w = Math.max(1, nextX - x)
          const valid = row.valid[c]
          const pctSunlit = row.pctSunlit[c]

          if (isHatch(valid)) {
            ctx.fillStyle = hatchPattern || '#161d2e'
          } else {
            ctx.fillStyle = getCellColor(valid, pctSunlit)
          }
          ctx.fillRect(x, y, w, ROW_HEIGHT)
        }
      }

      // Row separator line
      ctx.strokeStyle = '#2a3550'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y + ROW_HEIGHT - 0.5)
      ctx.lineTo(canvasWidth, y + ROW_HEIGHT - 0.5)
      ctx.stroke()
    }

    // Draw highlight outline for hovered or keyboard-selected cell
    const activeCell = hoveredCell ?? keyboardHighlight
    if (
      activeCell &&
      activeCell.rowIndex >= 0 &&
      activeCell.rowIndex < rowCount &&
      activeCell.colIndex >= 0 &&
      activeCell.colIndex < colCount
    ) {
      const hx = Math.floor(activeCell.colIndex * colWidth)
      const nextHx = Math.floor((activeCell.colIndex + 1) * colWidth)
      const hw = Math.max(2, nextHx - hx)
      const hy = activeCell.rowIndex * ROW_HEIGHT

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.strokeRect(hx + 0.5, hy + 0.5, Math.max(2, hw - 1), ROW_HEIGHT - 1)
    }

    ctx.restore()
  }, [
    rows,
    bundles,
    rowCount,
    colCount,
    canvasWidth,
    canvasHeight,
    colWidth,
    hoveredCell,
    keyboardHighlight,
  ])

  // Cell activation (Click or Enter)
  const activateCell = useCallback(
    (cell: { rowIndex: number; colIndex: number }) => {
      const row = rows[cell.rowIndex]
      const bundle = bundles[cell.rowIndex]
      if (!row || !bundle) return

      const colDateMs = row.startMs + cell.colIndex * row.stepMs
      const dateStr = formatDateIso(colDateMs)
      const startUtc = `${dateStr}T00:00:00Z`
      const siteId = row.siteId
      const siteName = bundle.site.name || siteId

      const currentScenarios = useAppStore.getState().scenarios
      const durationH = Math.min(1440, Math.max(1, Math.round(missionRules.missionDurationH)))
      if (currentScenarios.length < 4) {
        addScenario({ siteId, startUtc, durationH })
      } else {
        const activeId = useAppStore.getState().activeScenarioId
        updateScenario(activeId, { siteId, startUtc, durationH })
      }

      setConfirmation(`Opened ${siteName} from ${dateStr}`)
    },
    [rows, bundles, addScenario, updateScenario, missionRules.missionDurationH]
  )

  // Announce cell for screen readers
  const updateAnnouncement = useCallback(
    (cell: { rowIndex: number; colIndex: number }) => {
      const row = rows[cell.rowIndex]
      const bundle = bundles[cell.rowIndex]
      if (!row || !bundle) return

      const colDateMs = row.startMs + cell.colIndex * row.stepMs
      const dateStr = formatDateUtc(colDateMs)
      const siteName = bundle.site.name || row.siteId
      const valid = row.valid[cell.colIndex]
      const pctSunlit = row.pctSunlit[cell.colIndex]
      const pctEarth = row.pctEarth[cell.colIndex]
      const longestDarkH = row.longestDarkH[cell.colIndex]

      const text = formatCellAnnouncement(
        siteName,
        dateStr,
        valid,
        pctSunlit,
        pctEarth,
        longestDarkH
      )
      setAnnouncement(text)
    },
    [rows, bundles]
  )

  // Pointer interactions
  function handlePointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const cell = cellFromPointer(x, y, canvasWidth, canvasHeight, rowCount, colCount)
    // Keep the same object while the pointer stays in one cell, so the canvas is not redrawn per pixel.
    setHoveredCell((prev) => {
      if (!cell) return null
      if (prev && prev.rowIndex === cell.rowIndex && prev.colIndex === cell.colIndex) return prev
      return cell
    })
    if (cell) setTooltipPos({ x: e.clientX, y: e.clientY })
  }

  function handlePointerLeave() {
    setHoveredCell(null)
  }

  function handleCanvasClick(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const cell = cellFromPointer(x, y, canvasWidth, canvasHeight, rowCount, colCount)
    if (cell) {
      activateCell(cell)
      updateAnnouncement(cell)
    }
  }

  // Keyboard navigation
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (rowCount === 0 || colCount === 0) return

    if (e.key === 'Enter') {
      const current = keyboardHighlight ?? hoveredCell ?? { rowIndex: 0, colIndex: 0 }
      e.preventDefault()
      activateCell(current)
      updateAnnouncement(current)
      return
    }

    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown'
    ) {
      e.preventDefault()
      const current = keyboardHighlight ?? { rowIndex: 0, colIndex: 0 }
      const next = moveHighlight(current, e.key, e.shiftKey, rowCount, colCount)
      if (next) {
        setKeyboardHighlight(next)
        updateAnnouncement(next)
      }
    }
  }

  // Compute month ticks
  const monthTicks = useMemo(() => {
    if (!rows[0]) return []
    return getMonthTicks(rows[0].startMs, rows[0].stepMs, rows[0].count)
  }, [rows])

  // Best site sentence
  const bestSiteSentence = useMemo(() => {
    return getBestSiteSentence(
      rows,
      bundles.map((b) => b.site)
    )
  }, [rows, bundles])

  // Active tooltip details
  const activeTooltipData = useMemo(() => {
    if (!hoveredCell) return null
    const row = rows[hoveredCell.rowIndex]
    const bundle = bundles[hoveredCell.rowIndex]
    if (!row || !bundle) return null

    const colDateMs = row.startMs + hoveredCell.colIndex * row.stepMs
    const dateStr = formatDateUtc(colDateMs)
    const valid = row.valid[hoveredCell.colIndex]
    const pctSunlit = row.pctSunlit[hoveredCell.colIndex]
    const pctEarth = row.pctEarth[hoveredCell.colIndex]
    const longestDarkH = row.longestDarkH[hoveredCell.colIndex]

    return {
      siteName: siteRowLabel(bundle),
      dateStr,
      valid,
      pctSunlit: pctSunlit.toFixed(1),
      pctEarth: pctEarth.toFixed(1),
      longestDarkH: longestDarkH.toFixed(1),
    }
  }, [hoveredCell, rows, bundles])

  // Loading state
  if (loading) {
    return (
      <div className={`finder ${className}`.trim()} aria-busy="true">
        <div className="finder__loading" role="status" aria-live="polite">
          <p>
            Loading data for {loadedCount} of {Math.max(totalSites, 1)} sites
          </p>
          <progress
            className="finder__progress-bar"
            value={loadedCount}
            max={Math.max(totalSites, 1)}
          />
        </div>
      </div>
    )
  }

  // Error state
  if (loadError) {
    return (
      <div className={`finder ${className}`.trim()} role="alert">
        <div className="finder__error">
          <p className="finder__error-msg">Could not load site data. {loadError}</p>
          <button type="button" className="finder__retry-btn" onClick={handleRetry}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  // Empty state
  if (bundles.length === 0) {
    return (
      <div className={`finder ${className}`.trim()}>
        <div className="finder__empty">No sites available.</div>
      </div>
    )
  }

  const isNoSiteFit = bestSiteSentence.startsWith('No site fits')

  return (
    <section className={`finder ${className}`.trim()} aria-label="Window map and mission finder">
      {/* Aria-live announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Header & Best site sentence on top */}
      <div className="finder__header">
        <h2 className="finder__title">Site comparison and landing windows</h2>
        <p className={`finder__best-site ${isNoSiteFit ? 'finder__best-site--empty' : ''}`.trim()}>
          {bestSiteSentence}
        </p>
      </div>

      {/* Confirmation notification line */}
      {confirmation && (
        <div className="finder__status" role="status">
          <span className="finder__confirmation">{confirmation}</span>
        </div>
      )}

      {/* Legend & Rule summary */}
      <div className="finder__legend-bar">
        <div className="finder__legend" role="group" aria-label="Grid legend">
          <span className="finder__legend-item">
            <span className="finder__swatch finder__swatch--valid" aria-hidden="true" />
            <span>Valid</span>
          </span>
          <span className="finder__legend-item">
            <span className="finder__swatch finder__swatch--invalid" aria-hidden="true" />
            <span>Not valid</span>
          </span>
          <span className="finder__legend-item">
            <span className="finder__swatch finder__swatch--hatch" aria-hidden="true" />
            <span>No data</span>
          </span>
        </div>
        <p className="finder__rule-summary">{formatRuleSummary(missionRules)}</p>
      </div>

      {/* Grid container */}
      <div className="finder__grid-container" ref={wrapperRef}>
        {/* Month ticks on top */}
        <div className="finder__month-header" aria-hidden="true">
          <div className="finder__month-spacer" style={{ width: LABEL_COL_WIDTH }} />
          <div className="finder__month-track">
            {monthTicks.map((tick) => (
              <span
                key={`${tick.colIndex}-${tick.label}`}
                className="finder__month-tick"
                style={{ left: `${tick.pctX}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        {/* Grid body */}
        <div className="finder__grid-body">
          {/* HTML Site Labels Column */}
          <div className="finder__labels-col" style={{ width: LABEL_COL_WIDTH }}>
            {bundles.map((b) => (
              <div
                key={b.site.id}
                className="finder__row-label"
                style={{ height: ROW_HEIGHT }}
                title={`${siteRowLabel(b)} (${b.site.category})`}
              >
                {siteRowLabel(b)}
              </div>
            ))}
          </div>

          {/* Canvas Wrapper */}
          <div
            className="finder__canvas-wrapper"
            tabIndex={0}
            role="region"
            data-no-shortcuts=""
            aria-label="Window map grid. Use arrow keys to navigate days and sites, Enter to open scenario."
            onKeyDown={handleKeyDown}
          >
            <canvas
              ref={canvasRef}
              className="finder__canvas"
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onPointerDown={handleCanvasClick}
            />

            {/* Hover Tooltip Card */}
            {activeTooltipData && tooltipPos && (
              <div
                className="finder__tooltip"
                style={{
                  top: (hoveredCell?.rowIndex ?? 0) * ROW_HEIGHT + ROW_HEIGHT + 4,
                  left: Math.min(
                    Math.max(10, (hoveredCell?.colIndex ?? 0) * colWidth - 80),
                    canvasWidth - 220
                  ),
                }}
              >
                <div className="finder__tooltip-title">{activeTooltipData.siteName}</div>
                <div className="finder__tooltip-row">{activeTooltipData.dateStr} (UTC)</div>
                <div
                  className={`finder__tooltip-status ${
                    activeTooltipData.valid === 1
                      ? 'finder__tooltip-status--valid'
                      : activeTooltipData.valid === 255
                        ? 'finder__tooltip-status--nodata'
                        : 'finder__tooltip-status--invalid'
                  }`}
                >
                  {activeTooltipData.valid === 1
                    ? 'Valid landing window'
                    : activeTooltipData.valid === 255
                      ? 'Outside data coverage'
                      : 'Does not fit mission rules'}
                </div>
                {activeTooltipData.valid !== 255 && (
                  <>
                    <div className="finder__tooltip-row">
                      Sun visible: {activeTooltipData.pctSunlit}%
                    </div>
                    <div className="finder__tooltip-row">
                      Earth in view: {activeTooltipData.pctEarth}%
                    </div>
                    <div className="finder__tooltip-row">
                      Longest dark: {activeTooltipData.longestDarkH} h
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Under the grid: Valid landing windows per site */}
      <div className="finder__windows-section">
        <h3 className="finder__section-title">Valid landing windows per site</h3>
        <div className="finder__sites-list">
          {bundles.map((bundle) => {
            const windows = siteWindows?.get(bundle.site.id) ?? []
            const displayedWindows = windows.slice(0, 5)
            const remainingCount = Math.max(0, windows.length - 5)

            return (
              <div key={bundle.site.id} className="finder__site-card">
                <h4 className="finder__site-name">{siteRowLabel(bundle)}</h4>
                {siteWindows === null ? (
                  <p className="finder__no-windows">Computing landing windows.</p>
                ) : displayedWindows.length === 0 ? (
                  <p className="finder__no-windows">No landing window with these rules.</p>
                ) : (
                  <ul className="finder__site-windows">
                    {displayedWindows.map((win, idx) => {
                      const buffer = slipBufferH(win)
                      const durH = (Date.parse(win.end_utc) - Date.parse(win.start_utc)) / 3_600_000
                      const isFragile = durH < 6
                      return (
                        <li key={idx}>
                          {formatLandingWindow(win)}
                          <span title="Any landing in this range meets the rules; a landing in the middle of it tolerates a slip of this many hours either way.">
                            {` · slip buffer ±${buffer} h`}
                          </span>
                          {isFragile && (
                            <>
                              {' '}
                              <span className="badge badge--fragile">fragile</span>
                            </>
                          )}
                        </li>
                      )
                    })}
                    {remainingCount > 0 && (
                      <li className="finder__more-windows">+{remainingCount} more</li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        {/* Skipped sites that failed to load */}
        {failedSites.length > 0 && (
          <div className="finder__failed-list" role="status">
            {failedSites.map((name) => (
              <span key={name}>Not available: {name}</span>
            ))}
          </div>
        )}
      </div>

      {/* Mission Rules Form ("Relax a rule below") */}
      <MissionRulesForm />
    </section>
  )
}

export default WindowMap
