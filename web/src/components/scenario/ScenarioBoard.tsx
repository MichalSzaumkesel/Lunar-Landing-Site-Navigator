// Scenario board: one card per site + date. ScenarioBoard and ScenarioCard({ scenarioId }) are imported by app/.
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { MAX_SCENARIOS } from '../../config/dataRange'
import type { SiteBundle } from '../../lib/types'
import { useScenarioEvents } from '../../lib/useScenarioEvents'
import { useScenarioMetrics } from '../../lib/useScenarioMetrics'
import { useSiteBundle } from '../../lib/useSiteBundle'
import type { SiteBundleStatus } from '../../lib/useSiteBundle'
import { scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { DataBadges } from '../badges/DataBadges'
import { useTourStore } from '../help/tourState'
import { ExportCardPngButton } from '../share'
import { SkyReadout } from '../sky/SkyReadout'
import { EventChips } from '../timeline/EventChips'
import { Timeline } from '../timeline/Timeline'
import { Countdowns } from './Countdowns'
import { MetricsPanel } from './MetricsPanel'
import { ScenarioControls } from './ScenarioControls'
import { SkyViews } from './SkyViews'
import { defaultCardDetailsOpen, formatSlip, formatWindow, siteSubtitle } from './cardLogic'
import './scenario.css'

function headingText(status: SiteBundleStatus, bundle: SiteBundle | null): { title: string; sub: string } {
  if (bundle) return { title: bundle.site.name, sub: siteSubtitle(bundle.site) }
  if (status === 'error') return { title: 'Site unavailable', sub: 'Try another site.' }
  return { title: 'Loading site', sub: ' ' }
}

function CardBody({ scenario }: { scenario: Scenario }) {
  const active = useAppStore((s) => s.activeScenarioId === scenario.id)
  const canRemove = useAppStore((s) => s.scenarios.length > 1)
  const scenarioCount = useAppStore((s) => s.scenarios.length)
  const isMulti = scenarioCount > 1
  const tourOpen = useTourStore((s) => s.isOpen)
  const setActive = useAppStore((s) => s.setActiveScenario)
  const removeScenario = useAppStore((s) => s.removeScenario)
  const heightM = useAppStore((s) => s.observerHeightM)
  const { status, bundle } = useSiteBundle(scenario.siteId)
  const events = useScenarioEvents(bundle, heightM)
  const { startMs, endMs } = scenarioWindowMs(scenario)
  const metrics = useScenarioMetrics(bundle, heightM, startMs, endMs)
  const { title, sub } = headingText(status, bundle)

  const [userOpen, setUserOpen] = useState(() => defaultCardDetailsOpen(scenarioCount))
  const [prevMulti, setPrevMulti] = useState(isMulti)

  if (prevMulti !== isMulti) {
    setPrevMulti(isMulti)
    setUserOpen(!isMulti)
  }

  const tourDomOpen = typeof document !== 'undefined' && Boolean(document.querySelector('[data-tour-open]'))
  const isDetailsOpen = tourOpen || tourDomOpen || userOpen

  const activate = () => {
    if (!active) setActive(scenario.id)
  }
  const onRemove = (e: MouseEvent) => {
    // The click must not bubble to the card, which would select the card that was just removed.
    e.stopPropagation()
    removeScenario(scenario.id)
  }

  return (
    <section
      className={active ? 'card card--active' : 'card'}
      onClick={activate}
      onFocusCapture={activate}
      aria-current={active ? 'true' : undefined}
      aria-label={`Scenario ${bundle?.site.name ?? title}`}
    >
      <header className="card__header" data-tour="card-header">
        <div className="card__heading">
          <h2 className="card__title">{title}</h2>
          <p className="card__sub">{sub}</p>
          <p className="card__dates">
            {formatWindow(startMs, endMs)}
            {scenario.slipDays !== 0 && ` · ${formatSlip(scenario.slipDays)}`}
          </p>
        </div>
        <div className="card__aside">
          {bundle && (
            <div className="card__badges">
              <DataBadges synthetic={bundle.synthetic} approximate={bundle.approximate} />
            </div>
          )}
          <ExportCardPngButton
            scenario={scenario}
            siteName={bundle?.site.name ?? title}
            bundle={bundle}
            metrics={metrics}
          />
          {canRemove && (
            <button
              type="button"
              className="ghost"
              onClick={onRemove}
              aria-label={`Remove scenario ${bundle?.site.name ?? title}`}
            >
              Remove
            </button>
          )}
        </div>
      </header>

      <SkyViews scenarioId={scenario.id} siteName={bundle?.site.name ?? title} />
      <SkyReadout scenarioId={scenario.id} />
      <Timeline scenarioId={scenario.id} />
      <Countdowns scenario={scenario} bundle={bundle} events={events} heightM={heightM} />

      <details
        className="card__more"
        open={isDetailsOpen}
        onToggle={(e) => {
          if (!tourOpen && !tourDomOpen) {
            setUserOpen(e.currentTarget.open)
          }
        }}
      >
        <summary className="card__more-summary">Details and controls</summary>
        <EventChips scenario={scenario} bundle={bundle} events={events} heightM={heightM} />
        <MetricsPanel scenario={scenario} bundle={bundle} heightM={heightM} />
        <ScenarioControls scenario={scenario} siteName={bundle?.site.name ?? title} />
      </details>
    </section>
  )
}

export function ScenarioCard({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <CardBody scenario={scenario} />
}

export function ScenarioBoard() {
  const scenarios = useAppStore((s) => s.scenarios)
  const activeId = useAppStore((s) => s.activeScenarioId)
  const addScenario = useAppStore((s) => s.addScenario)
  const full = scenarios.length >= MAX_SCENARIOS

  // The new card starts as a copy of the active one, so "same site, other date" is one edit away.
  const onAdd = () => {
    const base = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
    if (!base) return
    addScenario({ siteId: base.siteId, startUtc: base.startUtc, durationH: base.durationH, slipDays: base.slipDays })
  }

  return (
    <div className="board-wrap">
      {!full && (
        <div className="board__toolbar">
          <span className="board__count">
            {scenarios.length} of {MAX_SCENARIOS} scenarios
          </span>
          <button type="button" onClick={onAdd}>
            Add scenario
          </button>
        </div>
      )}
      <div className={`board board--${scenarios.length}`}>
        {scenarios.map((s) => (
          <ScenarioCard key={s.id} scenarioId={s.id} />
        ))}
      </div>
    </div>
  )
}
