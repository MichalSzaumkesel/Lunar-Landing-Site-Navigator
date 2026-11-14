import { useMemo, useState, type ChangeEvent } from 'react'
import { clampStartUtc, dateInputBounds, nextEventAfter, splitEvents } from '../scenario/cardLogic'
import { DataBadges } from '../badges/DataBadges'
import { FullscreenStage } from '../common/FullscreenStage'
import { chooseSkyZoom, describeBody, pickMask, skyCentreText } from '../sky/geometry'
import { ephemCoverage, sampleAt } from '../../lib/ephem'
import { useScenarioEvents } from '../../lib/useScenarioEvents'
import { useScenarioMetrics } from '../../lib/useScenarioMetrics'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import { DiagramStage } from './DiagramStage'
import { VIEW_OPTIONS, readDiagramView, writeDiagramView } from './diagramView'
import { SkyHelp } from './SkyHelp'
import type { DiagramView } from './SkyHelp'
import { PlacePicker } from './PlacePicker'
import { displayName } from './placeLabels'
import { formatWindowPlain, outOfRangeMessage, simpleStatus } from './simpleSummary'
import './simple.css'

export interface SimpleViewProps {
  className?: string
}

export function SimpleView({ className = '' }: SimpleViewProps) {
  // Bumping the key remounts the body, which loads the site again without reloading the page.
  const [attempt, setAttempt] = useState(0)
  return <SimpleBody key={attempt} className={className} onRetry={() => setAttempt((n) => n + 1)} />
}

interface SimpleBodyProps extends SimpleViewProps {
  onRetry: () => void
}

function SimpleBody({ className = '', onRetry }: SimpleBodyProps) {
  const scenario = useAppStore(
    (s) => s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0],
  )
  const updateScenario = useAppStore((s) => s.updateScenario)
  const cursorH = useAppStore((s) => s.cursorH)
  const [view, setView] = useState<DiagramView>(readDiagramView)
  const heightM = useAppStore((s) => s.observerHeightM)

  const { status, bundle } = useSiteBundle(scenario?.siteId ?? 'southpole_landed')
  const { startMs, endMs } = scenario ? scenarioWindowMs(scenario) : { startMs: 0, endMs: 0 }
  const events = useScenarioEvents(bundle, heightM)
  const metrics = useScenarioMetrics(bundle, heightM, startMs, endMs)

  const cursorMs = scenario ? scenarioCursorMs(scenario, cursorH) : 0
  const split = useMemo(() => (events ? splitEvents(events) : null), [events])
  const mask = useMemo(() => (bundle ? pickMask(bundle, heightM) : null), [bundle, heightM])

  const centreText = useMemo(
    () => skyCentreText(bundle ? chooseSkyZoom(bundle, heightM, startMs, endMs) : 90),
    [bundle, heightM, startMs, endMs],
  )

  const durationH = scenario?.durationH ?? 0
  const readout = useMemo(() => {
    if (!bundle) return null
    const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(bundle.ephem)
    const inCoverage = cursorMs >= covStartMs && cursorMs <= covEndMs && metrics !== null
    if (!inCoverage || !metrics) return 'outside' as const
    const sample = sampleAt(bundle.ephem, cursorMs)
    const azStep = bundle.horizon.az_step_deg
    const sunVisible = sample && mask ? describeBody(sample.sun, mask, azStep, bundle.ephem.sun_ang_radius_deg).visible : false
    const earthVisible = sample && mask ? describeBody(sample.earth, mask, azStep, bundle.ephem.earth_ang_radius_deg).visible : false

    return simpleStatus({
      sunVisible,
      earthVisible,
      nextSunEvent: split ? nextEventAfter(split.sun, cursorMs) ?? null : null,
      nextEarthEvent: split ? nextEventAfter(split.earth, cursorMs) ?? null : null,
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
  const setStart = (dateText: string) => {
    const startUtc = clampStartUtc(dateText, scenario.durationH)
    if (startUtc) {
      updateScenario(scenario.id, { startUtc, slipDays: 0 })
    }
  }
  const onStartDateChange = (e: ChangeEvent<HTMLInputElement>) => setStart(e.target.value)

  const siteName = bundle ? displayName(bundle.site) : scenario.siteId

  return (
    <section className={`simple-view ${className}`.trim()} aria-label="Simple mode view">
      <header className="simple-head">
        <div className="simple-head__main">
          <PlacePicker activeSiteId={scenario.siteId} />
          <p className="simple-card__window" title="UTC is world standard time, the same everywhere">
            {formatWindowPlain(startMs, endMs)} · world time (UTC)
          </p>
        </div>
        <div className="simple-head__aside">
          {bundle && <DataBadges synthetic={bundle.synthetic} approximate={bundle.approximate} notes={bundle.site.notes} />}
        </div>
      </header>

      <div className="simple-grid">
        <div className="simple-sky-col">
          <div className="simple-view-switch" role="group" aria-label="Sky view">
            {VIEW_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                className="simple-view-switch__btn"
                aria-pressed={view === o.key}
                onClick={() => {
                  setView(o.key)
                  writeDiagramView(o.key)
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <FullscreenStage className="simple-sky-wrap" dataTour="sky-plot">
            {(fsButton) => (
              <>
                <div className="simple-stage" data-view={view}>
                  <DiagramStage view={view} scenarioId={scenario.id} />
                </div>
                <div className="simple-tools">
                  <SkyHelp centreText={centreText} view={view} />
                  {fsButton}
                </div>
              </>
            )}
          </FullscreenStage>
        </div>

        <article className="simple-card" aria-label={`Details for ${siteName}`}>
          {status === 'error' && (
            <div className="simple-error" role="alert">
              <p className="simple-error__message">
                Could not load this place. Try another place.
              </p>
              <button type="button" className="simple-error__retry" onClick={onRetry}>
                Try again
              </button>
            </div>
          )}

          {status === 'loading' && !readout && (
            <div className="simple-skeleton" aria-busy="true" aria-label="Loading summary" />
          )}

          {readout === 'outside' && (
            <div className="simple-summary" data-tour="simple-summary" aria-label="Summary">
              <p className="simple-summary__sentence">This date is outside the data we have.</p>
              <p className="simple-summary__sentence">{outOfRangeMessage(min, max)}</p>
              <button type="button" className="simple-reset" onClick={() => setStart(min)}>
                Go to the first available date
              </button>
            </div>
          )}

          {readout && readout !== 'outside' && (
            <div className="simple-summary" data-tour="simple-summary" aria-label="Summary">
              <div className="simple-status" role="status" aria-label="Sun and Earth now">
                {readout.blocks.map((block) => (
                  <section
                    key={block.id}
                    className={`simple-block simple-block--${block.id} ${block.on ? 'simple-block--on' : 'simple-block--off'}`}
                  >
                    <span className="simple-block__dot" aria-hidden="true" />
                    <div className="simple-block__text">
                      <p className="simple-block__headline">{block.headline}</p>
                      <p className="simple-block__detail">{block.detail}</p>
                    </div>
                  </section>
                ))}
              </div>
              <dl className="simple-rows" aria-label="Over the whole window">
                {readout.rows.map((row) => (
                  <div key={row.id} className={row.child ? 'simple-row simple-row--child' : 'simple-row'}>
                    <dt>
                      {row.child && <span className="simple-row__arrow" aria-hidden="true" />}
                      {row.label}
                    </dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {readout.note && <p className="simple-summary__note">{readout.note}</p>}
            </div>
          )}

          <div className="simple-date">
            <label htmlFor="simple-start-date" className="simple-date__label">
              Start date (UTC)
            </label>
            <input
              id="simple-start-date"
              type="date"
              className="simple-date__input"
              min={min}
              max={max}
              value={scenario.startUtc.slice(0, 10)}
              onChange={onStartDateChange}
            />
          </div>
        </article>
      </div>
    </section>
  )
}
