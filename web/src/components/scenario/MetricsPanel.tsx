import { memo, useMemo } from 'react'
import { ephemCoverage, sampleAt } from '../../lib/ephem'
import { mastDelta } from '../../lib/mastDelta'
import type { ObserverHeightM, SiteBundle } from '../../lib/types'
import { useScenarioMetrics } from '../../lib/useScenarioMetrics'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { describeBody, pickMask } from '../sky/geometry'
import { cursorMetricRows, windowMetricRows } from './cardLogic'
import type { MetricRow } from './cardLogic'
import './scenario.css'

function Item({ row }: { row: MetricRow }) {
  const isClearance = /clearance/i.test(row.label)
  const plainTip = 'how far the centre of the Sun is above the terrain'
  return (
    <div className="metrics__item" title={isClearance ? plainTip : row.tip}>
      <dt title={isClearance ? plainTip : undefined}>{row.label}</dt>
      <dd>{row.value}</dd>
    </div>
  )
}

// The only part of the panel that follows the cursor: the Sun at the cursor time.
function CursorRows({ scenario, bundle, heightM }: { scenario: Scenario; bundle: SiteBundle; heightM: ObserverHeightM }) {
  const cursorH = useAppStore((s) => s.cursorH)
  const mask = useMemo(() => pickMask(bundle, heightM), [bundle, heightM])
  const sample = sampleAt(bundle.ephem, scenarioCursorMs(scenario, cursorH))
  const sun = sample
    ? describeBody(sample.sun, mask, bundle.horizon.az_step_deg, bundle.ephem.sun_ang_radius_deg)
    : null
  return (
    <>
      {cursorMetricRows(sun ? sun.el : null, sun ? sun.clearance : null).map((row) => (
        <Item key={row.key} row={row} />
      ))}
    </>
  )
}

const WindowRows = memo(function WindowRows({ rows }: { rows: MetricRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <Item key={row.key} row={row} />
      ))}
    </>
  )
})

export function MetricsPanel({ scenario, bundle, heightM }: {
  scenario: Scenario
  bundle: SiteBundle | null
  heightM: ObserverHeightM
}) {
  const { startMs, endMs } = scenarioWindowMs(scenario)
  // Once per bundle, observer height and window; the cursor never recomputes it.
  const metrics = useScenarioMetrics(bundle, heightM, startMs, endMs)
  const rows = useMemo(() => (metrics ? windowMetricRows(metrics) : null), [metrics])
  const delta = useMemo(
    () => (bundle ? mastDelta(bundle, startMs, endMs) : null),
    [bundle, startMs, endMs],
  )

  if (!bundle) return <div className="metrics metrics--loading" aria-busy="true" aria-label="Loading metrics" />
  if (!rows) {
    return (
      <div className="metrics metrics--empty" role="status">
        Outside data range
      </div>
    )
  }
  const cov = ephemCoverage(bundle.ephem)
  const partial = startMs < cov.startMs || endMs > cov.endMs

  const mastGainText = delta
    ? delta.gainH > 0.05
      ? `+${Number.isInteger(delta.gainH) ? delta.gainH : delta.gainH.toFixed(1)} h Sun visible`
      : 'no difference'
    : null

  return (
    <div className="metrics">
      <dl className="metrics__grid" aria-label="Metrics for the window">
        <CursorRows scenario={scenario} bundle={bundle} heightM={heightM} />
        <WindowRows rows={rows} />
        {mastGainText !== null && (
          <div
            className="metrics__item"
            title="Extra hours with the Sun centre above the terrain horizon when the observer stands 10 m above the ground instead of 2 m."
          >
            <dt>10 m mast vs 2 m</dt>
            <dd>{mastGainText}</dd>
          </div>
        )}
      </dl>
      {partial && <p className="metrics__note">Window partly outside data range. Window values cover the available part.</p>}
    </div>
  )
}
