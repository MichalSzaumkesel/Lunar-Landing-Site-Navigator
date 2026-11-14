import { useMemo, type ChangeEvent } from 'react'
import { clampStartUtc, dateInputBounds, formatWindow, nextEventAfter, splitEvents } from '../scenario/cardLogic'
import { DataBadges } from '../badges/DataBadges'
import { ShareButton } from '../share/ShareButton'
import { SkyPlot } from '../sky/SkyPlot'
import { describeBody, pickMask } from '../sky/geometry'
import { ephemCoverage, sampleAt } from '../../lib/ephem'
import { useScenarioEvents } from '../../lib/useScenarioEvents'
import { useScenarioMetrics } from '../../lib/useScenarioMetrics'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import { PlacePicker } from './PlacePicker'
import { simpleSummary } from './simpleSummary'
import './simple.css'

export interface SimpleViewProps {
  className?: string
}

export function SimpleView({ className = '' }: SimpleViewProps) {
  const scenario = useAppStore(
    (s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0],
  )
  const updateScenario = useAppStore((s) => s.updateScenario)
  const cursorH = useAppStore((s) => s.cursorH)

  const { status, bundle } = useSiteBundle(scenario?.siteId ?? 'southpole_landed')
  const { startMs, endMs } = scenario ? scenarioWindowMs(scenario) : { startMs: 0, endMs: 0 }
  const events = useScenarioEvents(bundle, 2)
  const metrics = useScenarioMetrics(bundle, 2, startMs, endMs)

  const cursorMs = scenario ? scenarioCursorMs(scenario, cursorH) : 0
  const split = useMemo(() => (events ? splitEvents(events) : null), [events])
  const mask = useMemo(() => (bundle ? pickMask(bundle, 2) : null), [bundle])

  const durationH = scenario?.durationH ?? 0
  const summaryData = useMemo(() => {
    if (!bundle) return null
    const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(bundle.ephem)
    const inCoverage = cursorMs >= covStartMs && cursorMs <= covEndMs && metrics !== null
    if (!inCoverage || !metrics) {
      return ['This date is outside the data we have.']
    }
    const sample = sampleAt(bundle.ephem, cursorMs)
    const azStep = bundle.horizon.az_step_deg
    const sunVisible = sample && mask ? describeBody(sample.sun, mask, azStep, bundle.ephem.sun_ang_radius_deg).visible : false
    const earthVisible = sample && mask ? describeBody(sample.earth, mask, azStep, bundle.ephem.earth_ang_radius_deg).visible : false
    const nextSun = split ? nextEventAfter(split.sun, cursorMs) ?? null : null
    const nextEarth = split ? nextEventAfter(split.earth, cursorMs) ?? null : null

    return simpleSummary({
      inCoverage: true,
      sunVisible,
      earthVisible,
      nextSunEvent: nextSun,
      nextEarthEvent: nextEarth,
      cursorMs,
      durationH,
      metrics,
      synthetic: bundle.synthetic,
    })
  }, [bundle, metrics, cursorMs, mask, split, durationH])

  if (!scenario) {
    return null
  }

  const { min, max } = dateInputBounds(scenario.durationH)
  const onStartDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const startUtc = clampStartUtc(e.target.value, scenario.durationH)
    if (startUtc) {
      updateScenario(scenario.id, { startUtc })
    }
  }

  const siteName = bundle
    ? bundle.site.name.replace(/^\[MOCK\]\s*/i, '')
    : scenario.siteId

  return (
    <section className={`simple-view ${className}`.trim()} aria-label="Simple mode view">
      <PlacePicker activeSiteId={scenario.siteId} />

      <div className="simple-grid">
        <div className="simple-sky-col">
          <div className="simple-sky-wrap" data-tour="sky-plot">
            <SkyPlot scenarioId={scenario.id} />
          </div>
          <div className="simple-legend" aria-label="Sky plot legend">
            <p className="simple-legend__text">
              Gold disc: the Sun. Blue disc: the Earth. Grey area: terrain that blocks the sky. Centre of the circle: straight up. Edge: the horizon.
            </p>
          </div>
        </div>

        <article className="simple-card" aria-label={`Details for ${siteName}`}>
          <header className="simple-card__header">
            <div className="simple-card__titles">
              <div className="simple-card__title-row">
                <h2 className="simple-card__title">{siteName}</h2>
                {bundle && <DataBadges synthetic={bundle.synthetic} approximate={bundle.approximate} />}
              </div>
              <p className="simple-card__window">{formatWindow(startMs, endMs)}</p>
            </div>
            <ShareButton className="simple-card__share" />
          </header>

          <div className="simple-date">
            <label htmlFor="simple-start-date" className="simple-date__label">
              Start date
            </label>
            <input
              id="simple-start-date"
              type="date"
              className="simple-date__input"
              min={min}
              max={max}
              value={scenario.startUtc.slice(0, 10)}
              onChange={onStartDateChange}
              aria-label="Start date"
            />
          </div>

          {status === 'error' && (
            <div className="simple-error" role="alert">
              <p className="simple-error__message">
                Could not load this place. Try another place.
              </p>
              <button
                type="button"
                className="simple-error__retry"
                onClick={() => {
                  window.location.reload()
                }}
              >
                Try again
              </button>
            </div>
          )}

          {status === 'loading' && !summaryData && (
            <div className="simple-skeleton" aria-busy="true" aria-label="Loading summary" />
          )}

          {summaryData && (
            <div className="simple-summary" data-tour="simple-summary" aria-label="Summary">
              {summaryData.map((sentence, idx) => (
                <p key={idx} className="simple-summary__sentence">
                  {sentence}
                </p>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
