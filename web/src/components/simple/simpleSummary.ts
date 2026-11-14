import { HOUR_MS } from '../../config/dataRange'
import type { SkyEvent } from '../../lib/events'
import type { ScenarioMetrics } from '../../lib/types'

export interface SimpleStatusInput {
  sunVisible: boolean
  earthVisible: boolean
  nextSunEvent?: SkyEvent | null
  nextEarthEvent?: SkyEvent | null
  cursorMs: number
  durationH: number
  metrics: Pick<ScenarioMetrics, 'pct_sunlit' | 'longest_dark_h' | 'pct_earth'>
  synthetic?: boolean
}

export interface SimpleChip {
  id: 'sun' | 'earth'
  /** True when the body is above the local horizon. */
  on: boolean
  text: string
}

export interface SimpleRow {
  id: 'sun' | 'dark' | 'earth'
  label: string
  value: string
}

export interface SimpleStatus {
  headline: 'Sunlit' | 'Dark'
  detail: string
  chips: SimpleChip[]
  rows: SimpleRow[]
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

function windowPhrase(durationH: number): string {
  if (durationH < 12) return 'the next few hours'
  const days = Math.round(durationH / 24)
  return days === 1 ? '1 day' : `${days} days`
}

function nextChange(
  visible: boolean,
  next: SkyEvent | null | undefined,
  cursorMs: number,
): string | null {
  if (!next) return null
  const diffH = Math.max(0, (next.ms - cursorMs) / HOUR_MS)
  return `${visible ? 'sets' : 'rises'} in ${formatCountdown(diffH)}`
}

/**
 * Builds the Simple mode readout: one headline (Sunlit or Dark), two chips and three window rows.
 * Wording only says what is visible in the sky, never power or a communication link.
 */
export function simpleStatus(input: SimpleStatusInput): SimpleStatus {
  const sunChange = nextChange(input.sunVisible, input.nextSunEvent, input.cursorMs)
  const earthChange = nextChange(input.earthVisible, input.nextEarthEvent, input.cursorMs)

  const state = input.sunVisible
    ? 'The Sun is above the horizon.'
    : "The Sun is below the horizon: the terrain or the Moon's curve hides it."
  const sunTail = sunChange
    ? `It ${sunChange}.`
    : input.sunVisible
      ? 'It does not set in the data.'
      : 'It does not rise in the data.'

  const earthText = input.earthVisible ? 'Earth in view' : 'Earth below horizon'
  const span = windowPhrase(input.durationH)

  return {
    headline: input.sunVisible ? 'Sunlit' : 'Dark',
    detail: `${state} ${sunTail}`,
    chips: [
      { id: 'sun', on: input.sunVisible, text: input.sunVisible ? 'Sun visible' : 'Sun below horizon' },
      {
        id: 'earth',
        on: input.earthVisible,
        text: earthChange ? `${earthText} · ${earthChange}` : earthText,
      },
    ],
    rows: [
      { id: 'sun', label: 'Sun visible', value: `${Math.round(input.metrics.pct_sunlit)}% of ${span}` },
      { id: 'dark', label: 'Longest dark stretch', value: formatSpan(input.metrics.longest_dark_h) },
      { id: 'earth', label: 'Earth in view', value: `${Math.round(input.metrics.pct_earth)}% of ${span}` },
    ],
    note: input.synthetic ? 'This is demo data, not a measurement.' : null,
  }
}
