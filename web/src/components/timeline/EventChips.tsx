import { memo, useMemo, useState } from 'react'
import { HOUR_MS } from '../../config/dataRange'
import { listEclipses } from '../../lib/eclipses'
import type { Eclipse } from '../../lib/eclipses'
import { longestStretches } from '../../lib/events'
import type { SkyEvent } from '../../lib/events'
import type { ObserverHeightM, SiteBundle } from '../../lib/types'
import { scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { MAX_CHIPS, eclipseChip, eventChip, eventsInWindow, selectChips, stretchChip } from './chips'
import './timeline.css'

interface Props {
  scenario: Scenario
  bundle: SiteBundle | null
  /** Events over the whole coverage (useScenarioEvents). */
  events: (SkyEvent[] & { eclipses?: Eclipse[] }) | null
  heightM: ObserverHeightM
}

// Depends on bundle, height and window only, so it does not re-render while the cursor moves.
export const EventChips = memo(function EventChips({ scenario, bundle, events, heightM }: Props) {
  const [expanded, setExpanded] = useState(false)
  const setCursorH = useAppStore((s) => s.setCursorH)
  const setPlaying = useAppStore((s) => s.setPlaying)
  const { startMs, endMs } = scenarioWindowMs(scenario)

  const chips = useMemo(() => {
    if (!bundle || !events) return null
    const regularEvents = eventsInWindow(events, startMs, endMs).map(eventChip)
    const eclipses = events.eclipses
      ? events.eclipses.filter((e) => e.startMs >= startMs && e.startMs < endMs)
      : listEclipses(bundle.ephem, startMs, endMs)
    const eclipseChips = eclipses.map(eclipseChip)
    const allEvents = [...regularEvents, ...eclipseChips].sort((a, b) => a.ms - b.ms)

    return {
      events: allEvents,
      stretches: longestStretches(bundle, heightM, startMs, endMs).map(stretchChip),
    }
  }, [bundle, events, heightM, startMs, endMs])

  if (!chips) return <div className="chips chips--loading" aria-busy="true" data-tour="chips" />

  const total = chips.events.length + chips.stretches.length
  if (total === 0) {
    return <div className="chips chips--empty" data-tour="chips">No sunset, sunrise or Earth events in this window</div>
  }

  const { shown, hidden } = selectChips(chips.events, chips.stretches, expanded)
  const jump = (ms: number) => {
    setPlaying(false)
    setCursorH((ms - startMs) / HOUR_MS)
  }

  return (
    <div className="chips" role="group" aria-label="Events in the window, times in UTC" data-tour="chips">
      <span className="chips__title">Events, UTC</span>
      {shown.map((c) => (
        <button key={c.id} type="button" className="chip" title={c.tip} onClick={() => jump(c.ms)}>
          <span className="chip__label">{c.label}</span>
          <span className="chip__time">{c.timeText}</span>
        </button>
      ))}
      {hidden > 0 && (
        <button type="button" className="chip chip--more" aria-expanded={false} onClick={() => setExpanded(true)}>
          +{hidden} more
        </button>
      )}
      {expanded && total > MAX_CHIPS && (
        <button type="button" className="chip chip--more" aria-expanded={true} onClick={() => setExpanded(false)}>
          Show fewer
        </button>
      )}
    </div>
  )
})
