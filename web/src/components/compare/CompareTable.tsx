import { useEffect, useMemo, useState } from 'react'
import { usePresenceValue } from '../../lib/usePresence'
import type { ReactElement } from 'react'
import { downloadText, scenariosToCsv, type ScenarioCsvRow } from '../../lib/exportCsv'
import { dataSource as defaultDataSource } from '../../lib/loader'
import type { ObserverHeightM, SiteBundle, SiteDataSource } from '../../lib/types'
import { scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { formatWindow } from '../scenario/cardLogic'
import {
  COMPARE_CRITERIA,
  computeScenarioValues,
  findBetterScenarioIds,
  sortScenariosByCriterion,
  type CompareCriterionId,
} from './compareLogic'
import { pickDiffPair, whatDiffersFor } from './whatDiffers'
import './compare.css'

export interface CompareTableProps {
  id?: string
  scenarios?: Scenario[]
  observerHeightM?: ObserverHeightM
  cursorH?: number
  dataSource?: SiteDataSource
  onClose?: () => void
}

/**
 * Compact scenario comparison table for 2-4 scenarios on the board.
 * Rows = criteria computed with existing lib/metrics.ts outputs.
 * Columns = scenarios.
 * Softly highlights the better value per row with neutral wording ("higher/lower", no verdict).
 * Reorders columns on row label click.
 */
export function CompareTable({
  id = 'scenario-compare-table',
  scenarios: propScenarios,
  observerHeightM: propObserverHeightM,
  cursorH: propCursorH,
  dataSource = defaultDataSource,
  onClose,
}: CompareTableProps): ReactElement {
  const storeScenarios = useAppStore((s) => s.scenarios)
  const storeObserverHeightM = useAppStore((s) => s.observerHeightM)
  const storeCursorH = useAppStore((s) => s.cursorH)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const setActiveScenario = useAppStore((s) => s.setActiveScenario)

  const scenarios = propScenarios ?? storeScenarios
  const observerHeightM = propObserverHeightM ?? storeObserverHeightM
  const cursorH = propCursorH ?? storeCursorH

  const [bundles, setBundles] = useState<Map<string, SiteBundle | null>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [sortCriterion, setSortCriterion] = useState<CompareCriterionId | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [copyMsg, setCopyMsg] = useState<string | null>(null)
  const copyP = usePresenceValue(copyMsg)

  // Derived loading state: true if any active scenario is not yet in bundles
  const loading = scenarios.some((s) => !bundles.has(s.id))

  // Load site bundles for all active scenarios
  useEffect(() => {
    let cancelled = false

    Promise.all(
      scenarios.map(async (s) => {
        try {
          const bundle = await dataSource.loadSite(s.siteId)
          return [s.id, bundle] as const
        } catch {
          return [s.id, null] as const
        }
      }),
    ).then(
      (entries) => {
        if (cancelled) return
        setError(null)
        setBundles(new Map(entries))
      },
      (err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Could not load comparison data: ${msg}`)
      },
    )

    return () => {
      cancelled = true
    }
  }, [scenarios, dataSource])

  // Compute values for all scenarios
  const scenarioData = useMemo(() => {
    return scenarios.map((s) => {
      const bundle = bundles.get(s.id) ?? null
      return computeScenarioValues(s, bundle, observerHeightM, cursorH)
    })
  }, [scenarios, bundles, observerHeightM, cursorH])

  // Sort columns if a row criterion is selected
  const sortedScenarios = useMemo(() => {
    return sortScenariosByCriterion(scenarioData, sortCriterion, sortDirection)
  }, [scenarioData, sortCriterion, sortDirection])

  // Neutral one-line difference of the active scenario and the next one, in board order
  const diffText = useMemo(() => {
    const pair = pickDiffPair(scenarioData, activeScenarioId)
    return pair ? whatDiffersFor(pair[0], pair[1]) : null
  }, [scenarioData, activeScenarioId])

  const handleSort = (critId: CompareCriterionId) => {
    const criterion = COMPARE_CRITERIA.find((c) => c.id === critId)
    if (sortCriterion === critId) {
      if (sortDirection === 'desc') {
        setSortDirection('asc')
      } else {
        // Toggle off back to board order
        setSortCriterion(null)
      }
    } else {
      setSortCriterion(critId)
      // Default to better-value-first: descending for 'higher', ascending for 'lower'
      setSortDirection(criterion?.better === 'higher' ? 'desc' : 'asc')
    }
  }

  const handleResetSort = () => {
    setSortCriterion(null)
  }

  const handleCopyCsv = async () => {
    try {
      const rows: ScenarioCsvRow[] = sortedScenarios.map((s) => {
        const { startMs, endMs } = scenarioWindowMs(s.scenario)
        return {
          siteName: s.bundle?.site.name ?? s.scenario.siteId,
          siteId: s.scenario.siteId,
          lat: s.bundle?.site.lat_deg ?? 0,
          lon: s.bundle?.site.lon_deg ?? 0,
          startUtc: new Date(startMs).toISOString().replace('.000Z', 'Z'),
          endUtc: new Date(endMs).toISOString().replace('.000Z', 'Z'),
          slipDays: s.scenario.slipDays,
          observerHeightM,
          synthetic: s.bundle?.synthetic ?? false,
          approximate: s.bundle?.approximate ?? false,
          metrics: s.metrics,
          bothVisible: s.bothVisible,
        }
      })

      const csv = scenariosToCsv(rows)

      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(csv)
        setCopyMsg('Copied CSV')
      } else {
        downloadText(`comparison-${new Date().toISOString().slice(0, 10)}.csv`, csv)
        setCopyMsg('Downloaded CSV')
      }
    } catch {
      try {
        const rows: ScenarioCsvRow[] = sortedScenarios.map((s) => {
          const { startMs, endMs } = scenarioWindowMs(s.scenario)
          return {
            siteName: s.bundle?.site.name ?? s.scenario.siteId,
            siteId: s.scenario.siteId,
            lat: s.bundle?.site.lat_deg ?? 0,
            lon: s.bundle?.site.lon_deg ?? 0,
            startUtc: new Date(startMs).toISOString().replace('.000Z', 'Z'),
            endUtc: new Date(endMs).toISOString().replace('.000Z', 'Z'),
            slipDays: s.scenario.slipDays,
            observerHeightM,
            synthetic: s.bundle?.synthetic ?? false,
            approximate: s.bundle?.approximate ?? false,
            metrics: s.metrics,
          bothVisible: s.bothVisible,
          }
        })
        const csv = scenariosToCsv(rows)
        downloadText(`comparison-${new Date().toISOString().slice(0, 10)}.csv`, csv)
        setCopyMsg('Downloaded CSV')
      } catch {
        setCopyMsg('Could not export CSV')
      }
    }

    setTimeout(() => setCopyMsg(null), 2500)
  }

  // Four view states: empty (<2 scenarios), loading, error, normal
  if (scenarios.length < 2) {
    return (
      <section className="compare-section compare-section--empty" id={id} aria-label="Scenario comparison">
        <div className="compare-header">
          <div className="compare-title-group">
            <h2 className="compare-title">Scenario comparison</h2>
            <p className="compare-subtitle">2 to 4 scenarios required</p>
          </div>
          {onClose && (
            <button type="button" className="ghost" onClick={onClose} aria-label="Close comparison table">
              Close
            </button>
          )}
        </div>
        <p className="compare-empty-msg">
          Add at least 2 scenarios to the board to compare criteria side by side.
        </p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="compare-section" id={id} aria-label="Scenario comparison">
        <div className="compare-header">
          <h2 className="compare-title">Scenario comparison</h2>
          {onClose && (
            <button type="button" className="ghost" onClick={onClose} aria-label="Close comparison table">
              Close
            </button>
          )}
        </div>
        <p role="alert" className="compare-error-msg">
          {error}
        </p>
      </section>
    )
  }

  return (
    <section className="compare-section" id={id} aria-label="Scenario comparison">
      <header className="compare-header">
        <div className="compare-title-group">
          <h2 className="compare-title">Scenario comparison</h2>
          <span className="compare-subtitle">
            {scenarios.length} scenarios · click row label to sort columns
          </span>
        </div>
        <div className="compare-actions">
          {copyP.mounted && (
            <span role="status" className="compare-status-msg presence-fade" data-state={copyP.state}>
              {copyP.value}
            </span>
          )}
          {sortCriterion !== null && (
            <button
              type="button"
              className="ghost"
              onClick={handleResetSort}
              title="Restore default board order"
              aria-label="Reset column order"
            >
              Reset order
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={handleCopyCsv}
            title="Copy scenario metrics to clipboard as RFC 4180 CSV"
            aria-label="Copy scenario comparison as CSV"
          >
            Copy CSV
          </button>
          {onClose && (
            <button type="button" className="ghost" onClick={onClose} aria-label="Close comparison table">
              Close
            </button>
          )}
        </div>
      </header>

      {diffText && !loading && (
        <p className="compare-diff" data-testid="compare-diff">
          {diffText}
        </p>
      )}

      {loading && (
        <div className="compare-loading" role="status" aria-busy="true">
          Loading scenario data…
        </div>
      )}

      <div
        className="compare-container"
        tabIndex={0}
        role="region"
        aria-label="Scenario comparison table (scrollable horizontally)"
      >
        <table className="compare-table" aria-label="Scenario comparison table">
          <thead>
            <tr>
              <th scope="col" className="compare-th-criterion">
                Criterion
              </th>
              {sortedScenarios.map((s) => {
                const isActive = s.scenario.id === activeScenarioId
                const { startMs, endMs } = scenarioWindowMs(s.scenario)
                const title = s.bundle?.site.name ?? s.scenario.siteId
                return (
                  <th
                    key={s.scenario.id}
                    scope="col"
                    className={
                      isActive
                        ? 'compare-th-scenario compare-th-scenario--active'
                        : 'compare-th-scenario'
                    }
                  >
                    <button
                      type="button"
                      className="compare-scenario-btn"
                      onClick={() => setActiveScenario(s.scenario.id)}
                      title={`Select scenario ${title}`}
                      aria-current={isActive ? 'true' : undefined}
                      aria-label={`Scenario ${title}`}
                    >
                      <span className="compare-scenario-name">{title}</span>
                      <span className="compare-scenario-sub">{formatWindow(startMs, endMs)}</span>
                      {isActive ? (
                        <span className="compare-scenario-active-badge">Active</span>
                      ) : (
                        <span className="compare-scenario-active-badge compare-scenario-active-badge--placeholder" aria-hidden="true">
                          Active
                        </span>
                      )}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARE_CRITERIA.map((crit) => {
              const { betterScenarioIds, tag } = findBetterScenarioIds(crit, sortedScenarios)
              const isSorted = sortCriterion === crit.id
              const sortHint = isSorted
                ? sortDirection === 'asc'
                  ? ' ▲'
                  : ' ▼'
                : ''

              return (
                <tr key={crit.id}>
                  <th scope="row" className="compare-row-th">
                    <button
                      type="button"
                      className={
                        isSorted
                          ? 'compare-sort-btn compare-sort-btn--active'
                          : 'compare-sort-btn'
                      }
                      onClick={() => handleSort(crit.id)}
                      title={`${crit.tooltip} Click to reorder scenario columns.`}
                      aria-label={`Sort scenarios by ${crit.label}${isSorted ? `, sorted ${sortDirection}` : ''}`}
                      aria-pressed={isSorted}
                    >
                      <span>{crit.label}</span>
                      {crit.derived && (
                        <span className="compare-derived" title="Derived: computed from the same samples as the other rows">
                          derived
                        </span>
                      )}
                      {isSorted && (
                        <span className="compare-sort-arrow" aria-hidden="true">
                          {sortHint}
                        </span>
                      )}
                      {!isSorted && (
                        <span className="compare-sort-hint" aria-hidden="true">
                          sort
                        </span>
                      )}
                    </button>
                  </th>
                  {sortedScenarios.map((s) => {
                    const isBetter = betterScenarioIds.has(s.scenario.id)
                    const display = s.displayValues[crit.id]

                    return (
                      <td
                        key={s.scenario.id}
                        className={
                          isBetter ? 'compare-cell compare-cell--better' : 'compare-cell'
                        }
                      >
                        <span className="compare-value">{display}</span>
                        {isBetter && tag && (
                          <span
                            className="compare-tag"
                            title={`${tag === 'higher' ? 'Higher' : 'Lower'} value in comparison`}
                          >
                            {tag}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
