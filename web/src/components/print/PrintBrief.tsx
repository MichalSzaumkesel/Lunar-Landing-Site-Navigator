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
import { useScenarioMetrics } from '../../lib/useScenarioMetrics'
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

function useScenarioRenderData(
  scenario: Scenario | undefined,
  bundleOverride: SiteBundle | null | undefined,
  metricsOverride: ScenarioMetrics | null | undefined,
  observerHeightM: ObserverHeightM,
  cursorH: number,
  missionRules: MissionRules,
): ScenarioRenderData | null {
  const { bundle: resolvedBundle } = useSiteBundle(scenario?.siteId ?? '')
  const bundle = bundleOverride !== undefined ? bundleOverride : (scenario ? resolvedBundle : null)
  const windowRange = useMemo(
    () => (scenario ? scenarioWindowMs(scenario) : { startMs: 0, endMs: 0 }),
    [scenario],
  )
  const { startMs, endMs } = windowRange
  const cursorMs = useMemo(
    () => (scenario ? scenarioCursorMs(scenario, cursorH) : 0),
    [scenario, cursorH],
  )

  const computedMetrics = useScenarioMetrics(bundle, observerHeightM, startMs, endMs)
  const metrics = metricsOverride !== undefined ? metricsOverride : computedMetrics

  // Rules apply to the mission interval from landing, not to the whole scenario window (contract section 3).
  const missionEndMs = startMs + missionRules.missionDurationH * 3_600_000
  const missionMetrics = useScenarioMetrics(bundle, observerHeightM, startMs, missionEndMs)
  const ruleMetrics = metricsOverride !== undefined ? metricsOverride : missionMetrics

  const mastResult = useMemo(() => {
    if (!bundle || !scenario) return null
    return mastDelta(bundle, startMs, endMs)
  }, [bundle, scenario, startMs, endMs])

  const cursorValues = useMemo(() => {
    if (!bundle?.ephem || !bundle?.horizon || !scenario) return { sunElDeg: null, sunClearanceDeg: null }
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
  }, [bundle, observerHeightM, cursorMs, scenario])

  const sampleAtStart = useMemo(() => {
    if (!bundle?.ephem || !scenario) return null
    return sampleAt(bundle.ephem, startMs)
  }, [bundle, startMs, scenario])

  const rulesResult = useMemo(() => {
    if (!scenario) {
      return { allMet: false, statusText: 'outside data range', rules: [] }
    }
    const mask = bundle ? pickMask(bundle, observerHeightM) : undefined
    const azStep = bundle?.horizon?.az_step_deg
    return evaluateMissionRules(
      missionRules,
      ruleMetrics,
      sampleAtStart,
      mask,
      azStep,
      scenario.durationH,
    )
  }, [missionRules, ruleMetrics, sampleAtStart, bundle, observerHeightM, scenario])

  const provenance = useMemo(() => (scenario ? formatProvenance(bundle) : ''), [bundle, scenario])
  const dateRangeText = useMemo(
    () => (scenario ? formatScenarioDateRange(startMs, endMs, scenario.slipDays) : ''),
    [startMs, endMs, scenario],
  )
  const coordsText = useMemo(() => {
    if (!scenario || !bundle?.site) return 'outside data range'
    return formatPrintCoords(bundle.site.lat_deg, bundle.site.lon_deg)
  }, [bundle, scenario])

  if (!scenario) return null

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

  // Always invoke hooks in the exact same order and count (fixed at 4 slots)
  const s0 = useScenarioRenderData(
    scenarios[0],
    scenarios[0] ? (bundlesProp?.[scenarios[0].id] ?? bundlesProp?.[scenarios[0].siteId]) : undefined,
    scenarios[0] ? metricsMapProp?.[scenarios[0].id] : undefined,
    observerHeightM,
    cursorH,
    missionRules,
  )
  const s1 = useScenarioRenderData(
    scenarios[1],
    scenarios[1] ? (bundlesProp?.[scenarios[1].id] ?? bundlesProp?.[scenarios[1].siteId]) : undefined,
    scenarios[1] ? metricsMapProp?.[scenarios[1].id] : undefined,
    observerHeightM,
    cursorH,
    missionRules,
  )
  const s2 = useScenarioRenderData(
    scenarios[2],
    scenarios[2] ? (bundlesProp?.[scenarios[2].id] ?? bundlesProp?.[scenarios[2].siteId]) : undefined,
    scenarios[2] ? metricsMapProp?.[scenarios[2].id] : undefined,
    observerHeightM,
    cursorH,
    missionRules,
  )
  const s3 = useScenarioRenderData(
    scenarios[3],
    scenarios[3] ? (bundlesProp?.[scenarios[3].id] ?? bundlesProp?.[scenarios[3].siteId]) : undefined,
    scenarios[3] ? metricsMapProp?.[scenarios[3].id] : undefined,
    observerHeightM,
    cursorH,
    missionRules,
  )

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
