// Pure logic of the event chips under the timeline bands.
import type { Eclipse } from '../../lib/eclipses'
import type { SkyEvent, SkyStretch } from '../../lib/events'
import { EVENT_DEFINITION, EVENT_LABEL } from '../scenario/cardLogic'

export const MAX_CHIPS = 8

export interface Chip {
  id: string
  label: string
  /** UTC time of the event or of the start of the stretch, "MM-DD HH:mm". */
  timeText: string
  ms: number
  tip: string
}

export function fmtChipTime(ms: number): string {
  return new Date(ms).toISOString().slice(5, 16).replace('T', ' ')
}

const fmtFull = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

/** Events with startMs <= ms < endMs from a time-sorted list (binary search on both ends). */
export function eventsInWindow(events: readonly SkyEvent[], startMs: number, endMs: number): SkyEvent[] {
  const lower = (target: number) => {
    let lo = 0
    let hi = events.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (events[mid].ms < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  return events.slice(lower(startMs), lower(endMs))
}

const hoursText = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} h`

export function eventChip(e: SkyEvent): Chip {
  return {
    id: `${e.kind}-${e.ms}`,
    label: EVENT_LABEL[e.kind],
    timeText: fmtChipTime(e.ms),
    ms: e.ms,
    tip: `${EVENT_LABEL[e.kind]} at ${fmtFull(e.ms)}. ${EVENT_DEFINITION[e.kind]}`,
  }
}

export function stretchChip(s: SkyStretch): Chip {
  const dark = s.kind === 'longest_dark'
  return {
    id: `${s.kind}-${s.startMs}`,
    label: `${dark ? 'Longest dark' : 'Longest no-Earth'} ${hoursText(s.hours)}`,
    timeText: fmtChipTime(s.startMs),
    ms: s.startMs,
    tip: dark
      ? `Longest stretch with the Sun below the terrain horizon: ${hoursText(s.hours)}, from ${fmtFull(s.startMs)} to ${fmtFull(s.endMs)}.`
      : `Longest stretch with the Earth below the terrain horizon: ${hoursText(s.hours)}, from ${fmtFull(s.startMs)} to ${fmtFull(s.endMs)}.`,
  }
}

export function eclipseChip(e: Eclipse): Chip {
  return {
    id: `eclipse-${e.startMs}`,
    label: 'Earth in front of the Sun',
    timeText: fmtChipTime(e.startMs),
    ms: e.startMs,
    tip: "Geometric overlap of the Earth and Sun discs seen from this site; terrain and Earth's atmosphere are not modelled.",
  }
}

export interface ChipSet {
  shown: Chip[]
  /** Events folded into the "+N more" count. */
  hidden: number
}

/**
 * Events in time order, then the longest stretches. Above `MAX_CHIPS` the later events fold into a
 * count unless `expanded`. The shown set does not depend on the cursor, so the row stays stable.
 */
export function selectChips(events: readonly Chip[], stretches: readonly Chip[], expanded: boolean): ChipSet {
  if (expanded || events.length + stretches.length <= MAX_CHIPS) {
    return { shown: [...events, ...stretches], hidden: 0 }
  }
  const room = Math.max(1, MAX_CHIPS - stretches.length)
  return { shown: [...events.slice(0, room), ...stretches], hidden: events.length - room }
}
