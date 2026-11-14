import { useMemo } from 'react'
import type { ReactElement } from 'react'
import type {
  MissionRules,
  ObserverHeightM,
  ScenarioMetrics,
  SiteBundle,
} from '../../lib/types'
import type { MastDeltaResult } from '../../lib/mastDelta'
import { sampleAt } from '../../lib/ephem'
import { mastDelta } from '../../lib/mastDelta'
import { computeMetrics } from '../../lib/metrics'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { describeBody, pickMask } from '../sky/geometry'
import {
  evaluateMissionRules,
  formatPrintCoords,
  formatPrintTimestamp,
  formatProvenance,
  formatScenarioDateRange,
  getPrintMetricRows,
  PRINT_FOOTER_TEXT,
} from './printHelpers'
import { PrintSkyPlot } from './PrintSkyPlot'
import './print.css'

export interface PrintBriefProps {
  className?: string
  forceVisible?: boolean
  scenarios?: Scenario[]
  observerHeightM?: ObserverHeightM
  cursorH?: number
  missionRules?: MissionRules
  bundles?: Record<string, SiteBundle | null>
  metricsMap?: Record<string, ScenarioMetrics | null>
  printTimeUtc?: string
}

interface ScenarioRenderData {
  scenario: Scenario
  bundle: SiteBundle | null
  startMs: number
  endMs: number
  cursorMs: number
  metrics: ScenarioMetrics | null
  mastResult: MastDeltaResult | null
  cursorValues: { sunElDeg: number | null; sunClearanceDeg: number | null }
  rulesResult: ReturnType<typeof evaluateMissionRules>
  provenance: string
  dateRangeText: string
  coordsText: string
}

function useResolvedBundle(scenario: Scenario, bundleOverride?: SiteBundle | null): SiteBundle | null {
  const { bundle } = useSiteBundle(scenario.siteId)
  if (bundleOverride !== undefined) {
    return bundleOverride
  }
  return bundle
}

function ScenarioColumnHeader({ data, observerHeightM }: { data: ScenarioRenderData; observerHeightM: ObserverHeightM }) {
  const { scenario, bundle, startMs, endMs, cursorMs, dateRangeText, coordsText } = data
  const title = bundle?.site?.name ?? scenario.siteId
  const category = bundle?.site?.category ? `(${bundle.site.category})` : ''
  const isSynthetic = bundle?.synthetic ?? (bundle?.provenance === 'mock')
  const isApproximate = bundle?.approximate ?? (bundle?.provenance === 'custom_approx')

  return (
    <th className="print-col-header" scope="col">
      <div className="print-col-header__inner">
        <div className="print-scenario-heading">
          <h2 className="print-scenario-title">{title}</h2>
          <div className="print-scenario-coords">
            {coordsText} {category}
          </div>
        </div>

        <div className="print-scenario-badges">
          {isSynthetic && <span className="print-badge print-badge--synthetic">Synthetic data</span>}
          {isApproximate && <span className="print-badge print-badge--approximate">Approximate</span>}
          {!isSynthetic && !isApproximate && <span className="print-badge print-badge--verified">Real data</span>}
        </div>

        <div className="print-scenario-dates">
          {dateRangeText}
        </div>

        <div className="print-scenario-sky">
          <PrintSkyPlot
            bundle={bundle}
            observerHeightM={observerHeightM}
            startMs={startMs}
            endMs={endMs}
            cursorMs={cursorMs}
            size={130}
          />
        </div>
      </div>
    </th>
  )
}

function SingleScenarioRow({
  scenario,
  bundleOverride,
  metricsOverride,
  observerHeightM,
  cursorH,
  missionRules,
}: {
  scenario: Scenario
  bundleOverride?: SiteBundle | null
  metricsOverride?: ScenarioMetrics | null
  observerHeightM: ObserverHeightM
  cursorH: number
  missionRules: MissionRules
}): ScenarioRenderData {
  const bundle = useResolvedBundle(scenario, bundleOverride)
  const { startMs, endMs } = scenarioWindowMs(scenario)
  const cursorMs = scenarioCursorMs(scenario, cursorH)

  const metrics = useMemo(() => {
    if (metricsOverride !== undefined) return metricsOverride
    if (!bundle) return null
    return computeMetrics(bundle, {
      observerHeightM,
      startMs,
      endMs,
      refMs: startMs,
    })
  }, [bundle, observerHeightM, startMs, endMs, metricsOverride])

  const mastResult = useMemo(() => {
    if (!bundle) return null
    return mastDelta(bundle, startMs, endMs)
  }, [bundle, startMs, endMs])

  const cursorValues = useMemo(() => {
    if (!bundle?.ephem || !bundle?.horizon) return { sunElDeg: null, sunClearanceDeg: null }
    const mask = pickMask(bundle, observerHeightM)
    const sample = sampleAt(bundle.ephem, cursorMs)
    if (!sample) return { sunElDeg: null, sunClearanceDeg: null }
    const sun = describeBody(
      sample.sun,
      mask,
      bundle.horizon.az_step_deg,
      bundle.ephem.sun_ang_radius_deg,
    )
    return { sunElDeg: sun.el, sunClearanceDeg: sun.clearance }
  }, [bundle, observerHeightM, cursorMs])

  const sampleAtStart = useMemo(() => {
    if (!bundle?.ephem) return null
    return sampleAt(bundle.ephem, startMs)
  }, [bundle, startMs])

  const rulesResult = useMemo(() => {
    const mask = bundle ? pickMask(bundle, observerHeightM) : undefined
    const azStep = bundle?.horizon?.az_step_deg
    return evaluateMissionRules(
      missionRules,
      metrics,
      sampleAtStart,
      mask,
      azStep,
      scenario.durationH,
    )
  }, [missionRules, metrics, sampleAtStart, bundle, observerHeightM, scenario.durationH])

  const provenance = useMemo(() => formatProvenance(bundle), [bundle])
  const dateRangeText = useMemo(
    () => formatScenarioDateRange(startMs, endMs, scenario.slipDays),
    [startMs, endMs, scenario.slipDays],
  )
  const coordsText = useMemo(() => {
    if (!bundle?.site) return 'outside data range'
    return formatPrintCoords(bundle.site.lat_deg, bundle.site.lon_deg)
  }, [bundle])

  return {
    scenario,
    bundle,
    startMs,
    endMs,
    cursorMs,
    metrics,
    mastResult,
    cursorValues,
    rulesResult,
    provenance,
    dateRangeText,
    coordsText,
  }
}

export function PrintBrief({
  className = '',
  forceVisible = false,
  scenarios: scenariosProp,
  observerHeightM: observerHeightProp,
  cursorH: cursorHProp,
  missionRules: missionRulesProp,
  bundles: bundlesProp,
  metricsMap: metricsMapProp,
  printTimeUtc,
}: PrintBriefProps): ReactElement {
  const storeScenarios = useAppStore((s) => s.scenarios)
  const storeObserverHeight = useAppStore((s) => s.observerHeightM)
  const storeCursorH = useAppStore((s) => s.cursorH)
  const storeMissionRules = useAppStore((s) => s.missionRules)

  const scenarios = (scenariosProp ?? storeScenarios).slice(0, 4)
  const observerHeightM = observerHeightProp ?? storeObserverHeight
  const cursorH = cursorHProp ?? storeCursorH
  const missionRules = missionRulesProp ?? storeMissionRules
  const printTimestamp = printTimeUtc ?? formatPrintTimestamp()

  // Collect scenario data
  const s0 = scenarios[0] ? SingleScenarioRow({
    scenario: scenarios[0],
    bundleOverride: bundlesProp?.[scenarios[0].id] ?? bundlesProp?.[scenarios[0].siteId],
    metricsOverride: metricsMapProp?.[scenarios[0].id],
    observerHeightM,
    cursorH,
    missionRules,
  }) : null

  const s1 = scenarios[1] ? SingleScenarioRow({
    scenario: scenarios[1],
    bundleOverride: bundlesProp?.[scenarios[1].id] ?? bundlesProp?.[scenarios[1].siteId],
    metricsOverride: metricsMapProp?.[scenarios[1].id],
    observerHeightM,
    cursorH,
    missionRules,
  }) : null

  const s2 = scenarios[2] ? SingleScenarioRow({
    scenario: scenarios[2],
    bundleOverride: bundlesProp?.[scenarios[2].id] ?? bundlesProp?.[scenarios[2].siteId],
    metricsOverride: metricsMapProp?.[scenarios[2].id],
    observerHeightM,
    cursorH,
    missionRules,
  }) : null

  const s3 = scenarios[3] ? SingleScenarioRow({
    scenario: scenarios[3],
    bundleOverride: bundlesProp?.[scenarios[3].id] ?? bundlesProp?.[scenarios[3].siteId],
    metricsOverride: metricsMapProp?.[scenarios[3].id],
    observerHeightM,
    cursorH,
    missionRules,
  }) : null

  const scenarioDataList: ScenarioRenderData[] = [s0, s1, s2, s3].filter(
    (s): s is ScenarioRenderData => s !== null,
  )

  const metricRowsList = scenarioDataList.map((d) =>
    getPrintMetricRows(d.metrics, d.cursorValues, d.mastResult),
  )

  const templateRows = metricRowsList[0] ?? []
  const ruleTemplate = scenarioDataList[0]?.rulesResult.rules ?? []

  return (
    <div
      className={`print-brief-container ${
        forceVisible ? 'print-brief-container--visible' : ''
      }`.trim()}
    >
      <div className={`print-brief ${className}`.trim()}>
        {/* Document Header */}
        <header className="print-brief__header">
          <div className="print-brief__header-main">
            <h1 className="print-brief__doc-title">Lunar Surface Mission Brief</h1>
            <div className="print-brief__header-meta">
              <span className="print-brief__meta-item">
                Printed: <strong>{printTimestamp}</strong>
              </span>
              <span className="print-brief__meta-sep">·</span>
              <span className="print-brief__meta-item">
                Observer Height: <strong>{observerHeightM} m</strong>
              </span>
              <span className="print-brief__meta-sep">·</span>
              <span className="print-brief__meta-item">
                Scenarios: <strong>{scenarioDataList.length}</strong>
              </span>
            </div>
          </div>
        </header>

        {/* Content table */}
        {scenarioDataList.length === 0 ? (
          <div className="print-brief__empty">No scenarios to display.</div>
        ) : (
          <main className="print-brief__main">
            <table className="print-table" role="table">
              <thead>
                <tr>
                  <th className="print-table__row-header-th" scope="col">
                    Scenario / Site
                  </th>
                  {scenarioDataList.map((data) => (
                    <ScenarioColumnHeader
                      key={data.scenario.id}
                      data={data}
                      observerHeightM={observerHeightM}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* SECTION 1: MISSION RULES */}
                <tr className="print-table__section-heading-row">
                  <td
                    className="print-table__section-heading"
                    colSpan={1 + scenarioDataList.length}
                  >
                    Mission Rules Evaluation
                  </td>
                </tr>

                {/* Overall status row */}
                <tr className="print-table__row print-table__row--highlight">
                  <th className="print-table__row-label" scope="row">
                    All mission rules met
                  </th>
                  {scenarioDataList.map((d) => {
                    const met = d.rulesResult.allMet
                    return (
                      <td key={d.scenario.id} className="print-table__cell print-table__cell--center">
                        <span
                          className={`print-rule-status ${
                            met ? 'print-rule-status--met' : 'print-rule-status--fail'
                          }`}
                        >
                          {met ? '✓ Met' : '✗ Not met'}
                        </span>
                      </td>
                    )
                  })}
                </tr>

                {/* Individual rule rows */}
                {ruleTemplate.map((rule, idx) => (
                  <tr key={rule.key} className="print-table__row">
                    <th className="print-table__row-label" scope="row">
                      {rule.label} ({rule.target})
                    </th>
                    {scenarioDataList.map((d) => {
                      const r = d.rulesResult.rules[idx]
                      if (!r) return <td key={d.scenario.id} className="print-table__cell">—</td>
                      return (
                        <td key={d.scenario.id} className="print-table__cell">
                          <div className="print-rule-detail">
                            <span className="print-rule-detail__actual">{r.actual}</span>
                            <span
                              className={`print-rule-detail__tag ${
                                r.met ? 'print-rule-detail__tag--met' : 'print-rule-detail__tag--fail'
                              }`}
                            >
                              {r.met ? 'Met' : 'Not met'}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* SECTION 2: METRICS TABLE */}
                <tr className="print-table__section-heading-row">
                  <td
                    className="print-table__section-heading"
                    colSpan={1 + scenarioDataList.length}
                  >
                    Scenario Metrics (Contract §3)
                  </td>
                </tr>

                {templateRows.map((metricRow, rowIdx) => (
                  <tr key={metricRow.key} className="print-table__row">
                    <th className="print-table__row-label" scope="row" title={metricRow.tip}>
                      {metricRow.label}
                    </th>
                    {scenarioDataList.map((d, colIdx) => {
                      const cellVal = metricRowsList[colIdx]?.[rowIdx]?.value ?? 'outside data range'
                      return (
                        <td key={d.scenario.id} className="print-table__cell print-table__cell--mono">
                          {cellVal}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* SECTION 3: DATA PROVENANCE */}
                <tr className="print-table__section-heading-row">
                  <td
                    className="print-table__section-heading"
                    colSpan={1 + scenarioDataList.length}
                  >
                    Data Provenance
                  </td>
                </tr>
                <tr className="print-table__row">
                  <th className="print-table__row-label" scope="row">
                    Source & Provenance
                  </th>
                  {scenarioDataList.map((d) => (
                    <td key={d.scenario.id} className="print-table__cell print-table__cell--provenance">
                      {d.provenance}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </main>
        )}

        {/* Footer */}
        <footer className="print-brief__footer">
          <p className="print-brief__footer-disclaimer">{PRINT_FOOTER_TEXT}</p>
        </footer>
      </div>
    </div>
  )
}
