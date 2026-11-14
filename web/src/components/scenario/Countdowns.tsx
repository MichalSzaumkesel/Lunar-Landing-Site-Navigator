import { useMemo } from 'react'
import { ephemCoverage, sampleAt } from '../../lib/ephem'
import type { SkyEvent } from '../../lib/events'
import type { ObserverHeightM, ScenarioMetrics, SiteBundle } from '../../lib/types'
import { scenarioCursorMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { describeBody, pickMask } from '../sky/geometry'
import { EVENT_DEFINITION, bodyCountdown, formatChange, splitEvents } from './cardLogic'
import type { Countdown, CountdownBody, SlipChange } from './cardLogic'
import './scenario.css'

interface Props {
  scenario: Scenario
  bundle: SiteBundle | null
  /** Events over the whole coverage (useScenarioEvents). */
  events: SkyEvent[] | null
  heightM: ObserverHeightM
  /** Window metrics of the card; the two shares show next to the countdowns. */
  metrics: ScenarioMetrics | null
  /** Change versus slip 0, when the scenario is slipped. */
  change: SlipChange | null
}

function fmtEventUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

function Headline({ body, countdown }: { body: CountdownBody; countdown: Countdown }) {
  const { event } = countdown
  const tip = event
    ? `${EVENT_DEFINITION[event.kind]} Next: ${fmtEventUtc(event.ms)}.`
    : 'Time from the cursor to the next transition of the centre across the terrain horizon, within the data coverage.'
  return (
    <div className={`countdown countdown--${body}`} title={tip}>
      <span className="countdown__value">{countdown.text}</span>
      <span className="countdown__utc">{event ? fmtEventUtc(event.ms) : ' '}</span>
    </div>
  )
}

function Share({ body, label, value, tip, change }: {
  body: CountdownBody
  label: string
  value: number
  tip: string
  change: string | null
}) {
  return (
    <div className={`countdown countdown--${body}`} title={tip}>
      <span className="countdown__value">{`${label} ${value.toFixed(1)} %`}</span>
      <span className="countdown__utc">{change ? `vs slip 0: ${change}` : ' '}</span>
    </div>
  )
}

export function Countdowns({ scenario, bundle, events, heightM, metrics, change }: Props) {
  const cursorH = useAppStore((s) => s.cursorH)
  const split = useMemo(() => (events ? splitEvents(events) : null), [events])
  const mask = useMemo(() => (bundle ? pickMask(bundle, heightM) : null), [bundle, heightM])

  if (!bundle || !split || !mask) {
    return <div className="countdowns countdowns--loading" aria-busy="true" />
  }

  const cursorMs = scenarioCursorMs(scenario, cursorH)
  const { startMs, endMs } = ephemCoverage(bundle.ephem)
  const inCoverage = cursorMs >= startMs && cursorMs <= endMs
  const sample = inCoverage ? sampleAt(bundle.ephem, cursorMs) : null
  const step = bundle.horizon.az_step_deg
  const sunUp = sample ? describeBody(sample.sun, mask, step, bundle.ephem.sun_ang_radius_deg).visible : false
  const earthUp = sample ? describeBody(sample.earth, mask, step, bundle.ephem.earth_ang_radius_deg).visible : false

  return (
    <div className="countdowns countdowns--compact" aria-label="Time to next Sun and Earth events" role="group" data-tour="countdowns-metrics">
      <Headline body="sun" countdown={bodyCountdown('sun', split.sun, cursorMs, sample !== null, sunUp)} />
      <Headline body="earth" countdown={bodyCountdown('earth', split.earth, cursorMs, sample !== null, earthUp)} />
      {metrics && (
        <>
          <Share
            body="sun"
            label="Sun visible"
            value={metrics.pct_sunlit}
            tip="pct_sunlit: share of samples in the window where the Sun centre is above the terrain horizon."
            change={change ? formatChange(change.sunH, change.sunPp) : null}
          />
          <Share
            body="earth"
            label="Earth in view"
            value={metrics.pct_earth}
            tip="pct_earth: share of samples in the window where the Earth centre is above the terrain horizon."
            change={change ? formatChange(change.earthH, change.earthPp) : null}
          />
        </>
      )}
    </div>
  )
}
