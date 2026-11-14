// Scenario board: one card per site + date. ScenarioBoard and ScenarioCard({ scenarioId }) are imported by app/.
import { memo, useMemo, useState } from 'react'
import { AddScenarioMenu } from './AddScenarioMenu'
import { createPortal } from 'react-dom'
import { usePresence, usePresenceList } from '../../lib/usePresence'
import type { MouseEvent } from 'react'
import { HOUR_MS } from '../../config/dataRange'
import { MAX_SCENARIOS } from '../../config/dataRange'
import type { SiteBundle } from '../../lib/types'
import { useScenarioEvents } from '../../lib/useScenarioEvents'
import { useOriginalMetrics, useScenarioMetrics } from '../../lib/useScenarioMetrics'
import { useSiteBundle } from '../../lib/useSiteBundle'
import type { SiteBundleStatus } from '../../lib/useSiteBundle'
import { scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { DataBadges } from '../badges/DataBadges'
import { SkyReadout } from '../sky/SkyReadout'
import { EventChips } from '../timeline/EventChips'
import { Timeline } from '../timeline/Timeline'
import { Countdowns } from './Countdowns'
import { MetricsPanel } from './MetricsPanel'
import { ScenarioControls } from './ScenarioControls'
import { SiteSelect } from './SiteSelect'
import { SkyViews } from './SkyViews'
import { CustomSiteNote } from './CustomSiteNote'
import { datesSummary, formatWindow, metricsSummary, rulesSummary, siteSubtitle, slipChange } from './cardLogic'
import { CompareTable } from '../compare'
import { Disclosure } from '../ui/Disclosure'
import { useDisclosureStore } from '../../lib/disclosure'
import './scenario.css'

function headingText(status: SiteBundleStatus, bundle: SiteBundle | null): { title: string; sub: string } {
  if (bundle) return { title: bundle.site.name, sub: siteSubtitle(bundle.site) }
  if (status === 'error') return { title: 'Site unavailable', sub: 'Try another site.' }
  return { title: 'Loading site', sub: ' ' }
}

const CardBody = memo(function CardBody({ scenario }: { scenario: Scenario }) {
  const active = useAppStore((s) => s.activeScenarioId === scenario.id)
  const canRemove = useAppStore((s) => s.scenarios.length > 1)
  const setActive = useAppStore((s) => s.setActiveScenario)
  const removeScenario = useAppStore((s) => s.removeScenario)
  const heightM = useAppStore((s) => s.observerHeightM)
  const { status, bundle } = useSiteBundle(scenario.siteId)
  const events = useScenarioEvents(bundle, heightM)
  const { startMs, endMs } = scenarioWindowMs(scenario)
  const metrics = useScenarioMetrics(bundle, heightM, startMs, endMs)
  const original = useOriginalMetrics(bundle, heightM, startMs, endMs, scenario.slipDays)
  const change = useMemo(
    () => (metrics && original ? slipChange(metrics, original, (endMs - startMs) / HOUR_MS) : null),
    [metrics, original, startMs, endMs],
  )
  const { title, sub } = headingText(status, bundle)

  const missionRules = useAppStore((s) => s.missionRules)
  const openExplore = useDisclosureStore((s) => s.openExplore)

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
          <SiteSelect scenarioId={scenario.id} siteId={scenario.siteId} />
        </div>
        <div className="card__aside">
          {bundle && (
            <div className="card__badges">
              <DataBadges synthetic={bundle.synthetic} approximate={bundle.approximate} notes={bundle.site.notes} />
            </div>
          )}
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

      <Countdowns scenario={scenario} bundle={bundle} events={events} heightM={heightM} metrics={metrics} change={change} />
      {bundle?.site.category === 'custom' && <CustomSiteNote site={bundle.site} scenarioId={scenario.id} />}
      <SkyViews scenarioId={scenario.id} siteName={bundle?.site.name ?? title} />

      <div className="card__sections">
        <Disclosure
          sectionKey="dates"
          title="Dates and slip"
          summary={datesSummary(scenario.startUtc, scenario.durationH, scenario.slipDays)}
        >
          <ScenarioControls scenario={scenario} siteName={bundle?.site.name ?? title} change={change} />
        </Disclosure>
        <Disclosure sectionKey="metrics" title="Metrics and events" summary={metricsSummary(metrics)}>
          <SkyReadout scenarioId={scenario.id} />
          <EventChips scenario={scenario} bundle={bundle} events={events} heightM={heightM} />
          <MetricsPanel scenario={scenario} bundle={bundle} heightM={heightM} />
        </Disclosure>
        <Disclosure
          sectionKey="timeline"
          title="Timeline details"
          summary={`Sun and Earth bands over ${formatWindow(startMs, endMs)}`}
        >
          <Timeline scenarioId={scenario.id} />
        </Disclosure>
        <Disclosure sectionKey="rules" title="Mission rules" summary={rulesSummary(missionRules)}>
          <p className="card__rules-note">
            The mission bar in Timeline details turns green when a landing at that date meets these rules. The rules are shared by all cards.
          </p>
          <button type="button" className="secondary card__rules-edit" onClick={() => openExplore('window-map')}>
            Edit rules in Window finder
          </button>
        </Disclosure>
      </div>
    </section>
  )
})

export function ScenarioCard({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <CardBody scenario={scenario} />
}

export interface ScenarioBoardProps {
  /** Element in the app toolbar that hosts the scenario controls; without it they render inline. */
  toolbarSlot?: HTMLElement | null
}

export function ScenarioBoard({ toolbarSlot }: ScenarioBoardProps) {
  const [compareOpen, setCompareOpen] = useState(false)
  const scenarios = useAppStore((s) => s.scenarios)
  const activeId = useAppStore((s) => s.activeScenarioId)
  const addScenario = useAppStore((s) => s.addScenario)
  const applyPreset = useAppStore((s) => s.applyPreset)
  const full = scenarios.length >= MAX_SCENARIOS
  const compare = usePresence(compareOpen)
  const cards = usePresenceList(scenarios, (s) => s.id)

  // The new card starts as a copy of the active one, so "same site, other date" is one edit away.
  const onAdd = () => {
    const base = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
    if (!base) return
    addScenario({ siteId: base.siteId, startUtc: base.startUtc, durationH: base.durationH, slipDays: base.slipDays })
  }

  const scenarioControls = (
    <>
      <span className="board__count">
        {scenarios.length} of {MAX_SCENARIOS} scenarios
      </span>
      <button
        type="button"
        className={compareOpen ? 'secondary compare-toggle-btn active' : 'secondary compare-toggle-btn'}
        onClick={() => setCompareOpen((v) => !v)}
        aria-pressed={compareOpen}
        aria-expanded={compareOpen}
        aria-controls="scenario-compare-table"
      >
        Compare table
      </button>
      <AddScenarioMenu full={full} onAdd={onAdd} onPreset={(p) => applyPreset(p)} />
    </>
  )

  return (
    <div className="board-wrap">
      {toolbarSlot ? (
        createPortal(scenarioControls, toolbarSlot)
      ) : (
        <div className="board__scenarios">{scenarioControls}</div>
      )}
      {compare.mounted && (
        <div className="presence-collapse" data-state={compare.state}>
          <div className="presence-collapse__inner">
            <CompareTable onClose={() => setCompareOpen(false)} />
          </div>
        </div>
      )}
      <div className={`board board--${cards.length}`} data-tour="scenario-cards">
        {cards.map(({ item, state }) =>
          state === 'open' ? (
            <ScenarioCard key={item.id} scenarioId={item.id} />
          ) : (
            <div key={item.id} className="board__leaving" aria-hidden="true" inert>
              <CardBody scenario={item} />
            </div>
          ),
        )}
      </div>
    </div>
  )
}
