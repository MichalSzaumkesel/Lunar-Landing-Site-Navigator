import { HOUR_MS } from '../../config/dataRange'
import type { SkyEvent } from '../../lib/events'
import type { ScenarioMetrics } from '../../lib/types'
import type { WindowDetails } from './windowDetails'

export interface SimpleStatusInput {
  sunVisible: boolean
  earthVisible: boolean
  nextSunEvent?: SkyEvent | null
  nextEarthEvent?: SkyEvent | null
  cursorMs: number
  durationH: number
  metrics: Pick<ScenarioMetrics, 'pct_sunlit' | 'longest_dark_h' | 'pct_earth' | 'longest_no_earth_h'>
  details?: WindowDetails | null
  synthetic?: boolean
}

export interface SimpleBlock {
  id: 'sun' | 'earth'
  /** True when the body is above the local horizon. */
  on: boolean
  headline: string
  /** The next change, in the same format for both bodies. */
  detail: string
}

export interface SimpleRow {
  id: 'sun' | 'dark' | 'earth' | 'noEarth'
  label: string
  value: string
  /** Secondary metric shown under the row above it. */
  child?: boolean
}

export interface SimpleDetailRow {
  id: string
  label: string
  value: string
  /** Plain definition for the title attribute. */
  hint: string
  child?: boolean
}

export interface SimpleDetailGroup {
  title: string
  rows: SimpleDetailRow[]
}

export interface SimpleStatus {
  blocks: [SimpleBlock, SimpleBlock]
  rows: SimpleRow[]
  details: SimpleDetailGroup[]
  note: string | null
}

/** Plain message for a date outside the data, with the valid bounds and what to do. */
export function outOfRangeMessage(min: string, max: string): string {
  return `We only have data from ${formatDay(min)} to ${formatDay(max)}. Pick a start date in that range.`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2027-10-06" as "Oct 6, 2027" (the date part is read as UTC, no time zone shifts). */
export function formatDay(isoDay: string): string {
  const ms = Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(ms)) return isoDay
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** Window as "Oct 6 – Nov 5, 2027" (same year) or with both years. */
export function formatWindowPlain(startMs: number, endMs: number): string {
  const a = new Date(startMs)
  const b = new Date(endMs)
  const left = `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()}`
  const right = `${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}, ${b.getUTCFullYear()}`
  return a.getUTCFullYear() === b.getUTCFullYear()
    ? `${left} – ${right}`
    : `${left}, ${a.getUTCFullYear()} – ${right}`
}

/**
 * Formats a duration in hours into plain English.
 * Hours above 48 are also given in days.
 */
export function formatHoursWithDays(rawHours: number): string {
  const h = Math.round(Math.max(0, rawHours))
  if (h >= 48) {
    const days = Math.round(h / 24)
    const daysText = days === 1 ? 'about 1 day' : `about ${days} days`
    return `${h} hours, ${daysText}`
  }
  if (h === 1) {
    return '1 hour'
  }
  return `${h} hours`
}

/**
 * Formats an event countdown duration in hours into plain English.
 * Durations under 30 minutes say "less than an hour".
 */
export function formatCountdown(rawHours: number): string {
  const diffH = Math.max(0, rawHours)
  if (diffH < 0.5) {
    return 'less than an hour'
  }
  return formatHoursWithDays(diffH)
}

/** Short span for the longest dark stretch: "6 hours" or "15 days". */
function formatSpan(rawHours: number): string {
  const h = Math.round(Math.max(0, rawHours))
  if (h < 48) return h === 1 ? '1 hour' : `${h} hours`
  const days = Math.round(h / 24)
  return days === 1 ? '1 day' : `${days} days`
}

/** Longest-stretch value, or a plain phrase when there is none. */
function formatStretch(rawHours: number): string {
  return Math.round(Math.max(0, rawHours)) === 0 ? 'None in this window' : formatSpan(rawHours)
}

function windowPhrase(durationH: number): string {
  if (durationH < 12) return 'the next few hours'
  const days = Math.round(durationH / 24)
  return days === 1 ? '1 day' : `${days} days`
}

function nextChange(
  visible: boolean,
  next: SkyEvent | null | undefined,
  cursorMs: number,
  none: string,
): string {
  if (!next) return `${none} in the data window.`
  const diffH = Math.max(0, (next.ms - cursorMs) / HOUR_MS)
  return `It ${visible ? 'sets' : 'rises'} in ${formatCountdown(diffH)}.`
}

const NOT_AVAILABLE = 'Not available'

/** Whole degrees ("12°"), or "Not available" for a missing value. */
export function formatDegrees(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return NOT_AVAILABLE
  const r = Math.round(deg)
  return `${Object.is(r, -0) ? 0 : r}°`
}

/** Whole percent ("37%"), or "Not available" for a missing value. */
export function formatPercent(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return NOT_AVAILABLE
  return `${Math.round(Math.max(0, Math.min(100, pct)))}%`
}

/** Extra Sun-visible hours of a taller mast: "+12 hours", or "No difference". */
export function formatMastGain(gainH: number): string {
  const h = Math.round(Math.max(0, gainH))
  if (h === 0) return 'No difference'
  return `+${h} ${h === 1 ? 'hour' : 'hours'}`
}

/** The extra rows under the window summary, grouped Sun, Earth and Site; the mast row only with both heights. */
export function detailGroups(d: WindowDetails | null | undefined): SimpleDetailGroup[] {
  const sun: SimpleDetailRow[] = [
    {
      id: 'maxSun',
      label: 'Highest Sun above the horizon',
      value: formatDegrees(d?.maxSunElDeg),
      hint: 'The highest the centre of the Sun climbs above the flat (mean) horizon in this window. Hills are ignored here.',
    },
    {
      id: 'partSun',
      label: 'Sun partly hidden by hills',
      value: formatPercent(d?.sunPartlyHiddenPct),
      hint: 'Share of the Sun visible time (centre above the hills) when the hills still cover part of the Sun disc.',
      child: true,
    },
  ]
  if (d && d.mastGainH != null && Number.isFinite(d.mastGainH)) {
    sun.push({
      id: 'mast',
      label: 'Taller mast (10 m) adds',
      value: formatMastGain(d.mastGainH),
      hint: 'Extra hours of Sun visible when the observer stands 10 m above the ground instead of 2 m.',
    })
  }
  return [
    { title: 'Sun', rows: sun },
    {
      title: 'Earth',
      rows: [
        {
          id: 'maxEarth',
          label: 'Highest Earth above the horizon',
          value: formatDegrees(d?.maxEarthElDeg),
          hint: 'The highest the centre of the Earth climbs above the flat (mean) horizon in this window. Hills are ignored here.',
        },
        {
          id: 'earthLit',
          label: 'Earth lit by the Sun (phase)',
          value: formatPercent(d?.earthLitPct),
          hint: 'Average share of the Earth disc that is lit by the Sun, as seen from this place, over the whole window (also when Earth is below the horizon). Approximate.',
          child: true,
        },
      ],
    },
    {
      title: 'Site',
      rows: [
        {
          id: 'maxHill',
          label: 'Highest hill on the horizon',
          value: formatDegrees(d?.maxHillDeg),
          hint: 'The highest point of the terrain skyline at this place, for the chosen observer height, in degrees above the flat horizon.',
        },
      ],
    },
  ]
}

/**
 * Builds the Simple mode readout: a Sun block and an Earth block of the same shape, and three window rows.
 * Wording only says what is visible in the sky, never power or a communication link.
 */
export function simpleStatus(input: SimpleStatusInput): SimpleStatus {
  const span = windowPhrase(input.durationH)

  return {
    blocks: [
      {
        id: 'sun',
        on: input.sunVisible,
        headline: input.sunVisible ? 'Sun visible' : 'Sun below horizon',
        detail: nextChange(input.sunVisible, input.nextSunEvent, input.cursorMs, input.sunVisible ? 'No sunset' : 'No sunrise'),
      },
      {
        id: 'earth',
        on: input.earthVisible,
        headline: input.earthVisible ? 'Earth in view' : 'Earth below horizon',
        detail: nextChange(input.earthVisible, input.nextEarthEvent, input.cursorMs, input.earthVisible ? 'No Earthset' : 'No Earthrise'),
      },
    ],
    rows: [
      { id: 'sun', label: 'Sun visible', value: `${Math.round(input.metrics.pct_sunlit)}% of ${span}` },
      { id: 'dark', label: 'Longest dark stretch', value: formatStretch(input.metrics.longest_dark_h), child: true },
      { id: 'earth', label: 'Earth in view', value: `${Math.round(input.metrics.pct_earth)}% of ${span}` },
      { id: 'noEarth', label: 'Longest without Earth', value: formatStretch(input.metrics.longest_no_earth_h), child: true },
    ],
    details: detailGroups(input.details),
    note: input.synthetic ? 'This is demo data, not a measurement.' : null,
  }
}
