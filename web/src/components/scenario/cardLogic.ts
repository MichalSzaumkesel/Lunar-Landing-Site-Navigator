// Pure logic of the scenario card: formatting, date clamping, countdowns and metric rows.
import { DATA_END_MS, DATA_START_MS, DAY_MS, HOUR_MS } from '../../config/dataRange'
import type { SkyEvent, SkyEventKind } from '../../lib/events'
import type { ScenarioMetrics, Site, SiteCategory } from '../../lib/types'
import { fmtNum } from '../sky/geometry'

export const DURATION_DAYS = [3, 7, 10, 14, 30, 60] as const

const CATEGORY_LABEL: Record<SiteCategory, string> = {
  apollo: 'Apollo landing site',
  clps: 'CLPS site',
  commercial: 'Commercial site',
  international: 'International site',
  artemis_region: 'Artemis candidate region',
  custom: 'Custom site',
}

export function categoryLabel(category: SiteCategory): string {
  return CATEGORY_LABEL[category]
}

/** Coordinates as "89.90° S, 12.30° E" (longitude east positive). */
export function formatCoords(latDeg: number, lonDeg: number): string {
  const lat = `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}`
  const lon = `${Math.abs(lonDeg).toFixed(2)}° ${lonDeg < 0 ? 'W' : 'E'}`
  return `${lat}, ${lon}`
}

/** Groups sites by category, keeping the order of first appearance. */
export function groupByCategory(sites: readonly Site[]): Array<{ label: string; sites: Site[] }> {
  const groups = new Map<string, Site[]>()
  for (const s of sites) {
    const label = categoryLabel(s.category)
    groups.set(label, [...(groups.get(label) ?? []), s])
  }
  return [...groups].map(([label, list]) => ({ label, sites: list }))
}

export function siteSubtitle(site: Pick<Site, 'category' | 'lat_deg' | 'lon_deg'>): string {
  const label = categoryLabel(site.category)
  return site.category === 'custom' ? `${label} · ${formatCoords(site.lat_deg, site.lon_deg)}` : label
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function formatWindow(startMs: number, endMs: number): string {
  return `${utcDay(startMs)} to ${utcDay(endMs)} UTC`
}

export function formatSlip(days: number): string {
  if (days === 0) return 'slip 0 d'
  return `slip ${days > 0 ? '+' : '−'}${Math.abs(days)} d`
}

/** Time left as minutes, hours, or days and hours above 48 h. */
export function formatDuration(hours: number): string {
  const h = Math.max(0, hours)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 10) return `${h.toFixed(1)} h`
  if (h < 48) return `${Math.round(h)} h`
  let days = Math.floor(h / 24)
  let rest = Math.round(h - days * 24)
  if (rest === 24) {
    days += 1
    rest = 0
  }
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`
}

// --- Window start and length ---

/** Duration choices in hours; a value that is not on the list (from a preset or URL) stays selectable. */
export function durationOptionsH(currentH: number): number[] {
  const list = DURATION_DAYS.map((d) => d * 24)
  return list.includes(currentH) ? list : [...list, currentH].sort((a, b) => a - b)
}

/** First and last allowed window start (UTC day start) so that the whole window lies in the data coverage. */
export function startBoundsMs(durationH: number): { minMs: number; maxMs: number } {
  const minMs = Math.ceil(DATA_START_MS / DAY_MS) * DAY_MS
  const lastSampleMs = DATA_END_MS - Math.max(0, durationH - 1) * HOUR_MS
  const latest = Math.floor(lastSampleMs / DAY_MS) * DAY_MS
  return { minMs, maxMs: Math.max(minMs, latest) }
}

/** `<input type=date>` value (YYYY-MM-DD) to a clamped start `<date>T00:00:00Z`, or null when the text is not a date. */
export function clampStartUtc(dateText: string, durationH: number): string | null {
  const ms = Date.parse(`${dateText}T00:00:00Z`)
  if (!Number.isFinite(ms)) return null
  const { minMs, maxMs } = startBoundsMs(durationH)
  return `${utcDay(Math.min(maxMs, Math.max(minMs, ms)))}T00:00:00Z`
}

export function dateInputBounds(durationH: number): { min: string; max: string } {
  const { minMs, maxMs } = startBoundsMs(durationH)
  return { min: utcDay(minMs), max: utcDay(maxMs) }
}

// --- Countdowns ---

export type CountdownBody = 'sun' | 'earth'

export interface SplitEvents {
  sun: SkyEvent[]
  earth: SkyEvent[]
}

/** Splits the time-sorted event list per body, once per bundle and observer height. */
export function splitEvents(events: readonly SkyEvent[]): SplitEvents {
  const sun: SkyEvent[] = []
  const earth: SkyEvent[] = []
  for (const e of events) (e.kind === 'sunset' || e.kind === 'sunrise' ? sun : earth).push(e)
  return { sun, earth }
}

/** First event at or after `ms` in a time-sorted list (binary search), or undefined; matches contract section 3 (t >= t_ref). */
export function nextEventAfter(list: readonly SkyEvent[], ms: number): SkyEvent | undefined {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].ms >= ms) hi = mid
    else lo = mid + 1
  }
  return list[lo]
}

const VERB: Record<SkyEventKind, string> = {
  sunset: 'sets',
  sunrise: 'rises',
  earthset: 'sets',
  earthrise: 'rises',
}

export interface Countdown {
  text: string
  /** The event the text refers to, for the tooltip. */
  event: SkyEvent | null
}

/**
 * Headline countdown for one body. `visibleNow` tells which transition is missing when none follows
 * the cursor (a visible body would need a set, a hidden one a rise).
 */
export function bodyCountdown(
  body: CountdownBody,
  list: readonly SkyEvent[],
  cursorMs: number,
  inCoverage: boolean,
  visibleNow: boolean,
): Countdown {
  if (!inCoverage) return { text: 'Outside data range', event: null }
  const event = nextEventAfter(list, cursorMs)
  if (event) {
    const name = body === 'sun' ? 'Sun' : 'Earth'
    return { text: `${name} ${VERB[event.kind]} in ${formatDuration((event.ms - cursorMs) / HOUR_MS)}`, event }
  }
  const word = body === 'sun' ? (visibleNow ? 'sunset' : 'sunrise') : visibleNow ? 'Earthset' : 'Earthrise'
  return { text: `No ${word} in data range`, event: null }
}

export const EVENT_LABEL: Record<SkyEventKind, string> = {
  sunset: 'Sunset',
  sunrise: 'Sunrise',
  earthset: 'Earth set',
  earthrise: 'Earth rise',
}

export const EVENT_DEFINITION: Record<SkyEventKind, string> = {
  sunset:
    'Sunset: the Sun centre goes from above to below the terrain horizon. Time interpolated linearly between hourly samples (contract section 3).',
  sunrise:
    'Sunrise: the Sun centre goes from below to above the terrain horizon. Time interpolated linearly between hourly samples (contract section 3).',
  earthset:
    'Earth set: the Earth centre goes from above to below the terrain horizon. Time interpolated linearly between hourly samples (contract section 3).',
  earthrise:
    'Earth rise: the Earth centre goes from below to above the terrain horizon. Time interpolated linearly between hourly samples (contract section 3).',
}

// --- Metric rows ---

export interface MetricRow {
  key: string
  label: string
  value: string
  tip: string
}

const pct = (v: number) => `${fmtNum(v, 1)} %`
const hours = (v: number) => `${fmtNum(v, Number.isInteger(v) ? 0 : 1)} h`

/** The two rows that follow the time cursor; null values show a dash. */
export function cursorMetricRows(sunElDeg: number | null, sunClearanceDeg: number | null): MetricRow[] {
  return [
    {
      key: 'sun_el_deg',
      label: 'Sun elevation at cursor',
      value: sunElDeg === null ? '—' : `${fmtNum(sunElDeg, 2, true)} deg`,
      tip: 'sun_el_deg: elevation of the Sun centre at the cursor time, above the local horizontal. Terrain is ignored.',
    },
    {
      key: 'sun_clearance_deg',
      label: 'Sun clearance at cursor',
      value: sunClearanceDeg === null ? '—' : `${fmtNum(sunClearanceDeg, 2, true)} deg`,
      tip: 'sun_clearance_deg: Sun elevation minus the terrain horizon elevation at its azimuth, at the cursor time.',
    },
  ]
}

/** Window-wide rows, from the memoised metrics. */
export function windowMetricRows(m: ScenarioMetrics): MetricRow[] {
  return [
    {
      key: 'pct_sunlit',
      label: 'Sun visible',
      value: pct(m.pct_sunlit),
      tip: 'pct_sunlit: share of samples in the window where the Sun centre is above the terrain horizon (visible disc fraction at least 50 %).',
    },
    {
      key: 'mean_sun_frac',
      label: 'Mean visible Sun disc',
      value: pct(m.mean_sun_frac),
      tip: 'mean_sun_frac: mean visible fraction of the Sun disc over the window. The horizon is treated as locally straight across the disc.',
    },
    {
      key: 'longest_dark_h',
      label: 'Longest dark stretch',
      value: hours(m.longest_dark_h),
      tip: 'longest_dark_h: longest run of consecutive samples with the Sun below the terrain horizon, times the sample step.',
    },
    {
      key: 'pct_earth',
      label: 'Earth in view',
      value: pct(m.pct_earth),
      tip: 'pct_earth: share of samples in the window where the Earth centre is above the terrain horizon (visible disc fraction at least 50 %).',
    },
    {
      key: 'longest_no_earth_h',
      label: 'Longest no-Earth stretch',
      value: hours(m.longest_no_earth_h),
      tip: 'longest_no_earth_h: longest run of consecutive samples with the Earth below the terrain horizon, times the sample step.',
    },
    {
      key: 'pct_both',
      label: 'Sun and Earth together',
      value: pct(m.pct_both),
      tip: 'pct_both: share of samples in the window where both the Sun and the Earth centres are above the terrain horizon.',
    },
  ]
}
