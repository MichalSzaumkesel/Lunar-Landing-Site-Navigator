import { describe, expect, it } from 'vitest'
import type { SkyEvent } from '../../lib/events'
import type { ScenarioMetrics } from '../../lib/types'
import {
  bodyCountdown,
  clampStartUtc,
  cursorMetricRows,
  dateInputBounds,
  durationOptionsH,
  formatCoords,
  formatDuration,
  formatSlip,
  formatWindow,
  nextEventAfter,
  siteSubtitle,
  splitEvents,
  windowMetricRows,
} from './cardLogic'

const H = 3_600_000
const ev = (kind: SkyEvent['kind'], ms: number): SkyEvent => ({ kind, ms, utc: new Date(ms).toISOString() })

describe('formatDuration', () => {
  it('uses minutes below one hour', () => {
    expect(formatDuration(0.5)).toBe('30 min')
    expect(formatDuration(0.001)).toBe('1 min')
  })
  it('uses hours below 48 h', () => {
    expect(formatDuration(5.43)).toBe('5.4 h')
    expect(formatDuration(31.2)).toBe('31 h')
    expect(formatDuration(47.6)).toBe('48 h')
  })
  it('uses days and hours from 48 h', () => {
    expect(formatDuration(48)).toBe('2 d')
    expect(formatDuration(50)).toBe('2 d 2 h')
    expect(formatDuration(71.9)).toBe('3 d')
  })
})

describe('site and window text', () => {
  it('formats coordinates with hemispheres', () => {
    expect(formatCoords(-89.9, 12.3)).toBe('89.90° S, 12.30° E')
    expect(formatCoords(0.67, -23.47)).toBe('0.67° N, 23.47° W')
  })
  it('shows coordinates only for custom sites', () => {
    expect(siteSubtitle({ category: 'apollo', lat_deg: 0.67, lon_deg: 23.47 })).toBe('Apollo landing site')
    expect(siteSubtitle({ category: 'custom', lat_deg: -85, lon_deg: 10 })).toBe('Custom site · 85.00° S, 10.00° E')
  })
  it('formats the window in UTC days and the slip with a sign', () => {
    expect(formatWindow(Date.UTC(2027, 7, 30), Date.UTC(2027, 8, 29))).toBe('2027-08-30 to 2027-09-29 UTC')
    expect(formatSlip(14)).toBe('slip +14 d')
    expect(formatSlip(-3)).toBe('slip −3 d')
    expect(formatSlip(0)).toBe('slip 0 d')
  })
})

describe('window start and length', () => {
  it('lists the preset lengths and keeps an unusual current one', () => {
    expect(durationOptionsH(720)).toEqual([72, 168, 240, 336, 720, 1440])
    expect(durationOptionsH(500)).toEqual([72, 168, 240, 336, 500, 720, 1440])
  })
  it('clamps the start to the data coverage', () => {
    expect(clampStartUtc('2027-08-30', 720)).toBe('2027-08-30T00:00:00Z')
    expect(clampStartUtc('2020-01-01', 720)).toBe('2026-12-01T00:00:00Z')
    expect(clampStartUtc('2029-01-01', 720)).toBe('2028-12-02T00:00:00Z')
    expect(clampStartUtc('2029-01-01', 1440)).toBe('2028-11-02T00:00:00Z')
    expect(clampStartUtc('2029-01-01', 24)).toBe('2028-12-31T00:00:00Z')
  })
  it('rejects text that is not a date', () => {
    expect(clampStartUtc('', 720)).toBeNull()
    expect(clampStartUtc('abc', 720)).toBeNull()
  })
  it('gives input bounds', () => {
    expect(dateInputBounds(720)).toEqual({ min: '2026-12-01', max: '2028-12-02' })
    expect(dateInputBounds(24)).toEqual({ min: '2026-12-01', max: '2028-12-31' })
  })
})

describe('countdowns', () => {
  const list = [ev('sunset', 10 * H), ev('sunrise', 20 * H), ev('sunset', 30 * H)]

  it('finds the next event after a time by binary search', () => {
    expect(nextEventAfter(list, 5 * H)?.ms).toBe(10 * H)
    expect(nextEventAfter(list, 10 * H)?.ms).toBe(20 * H)
    expect(nextEventAfter(list, 29.9 * H)?.ms).toBe(30 * H)
    expect(nextEventAfter(list, 30 * H)).toBeUndefined()
    expect(nextEventAfter([], 0)).toBeUndefined()
  })

  it('splits events per body', () => {
    const { sun, earth } = splitEvents([ev('sunset', 1), ev('earthrise', 2), ev('sunrise', 3), ev('earthset', 4)])
    expect(sun.map((e) => e.kind)).toEqual(['sunset', 'sunrise'])
    expect(earth.map((e) => e.kind)).toEqual(['earthrise', 'earthset'])
  })

  it('words the next event', () => {
    expect(bodyCountdown('sun', list, 0, true, true).text).toBe('Sun sets in 10 h')
    expect(bodyCountdown('sun', list, 12 * H, true, false).text).toBe('Sun rises in 8.0 h')
    expect(bodyCountdown('earth', [ev('earthrise', 100 * H)], 0, true, false).text).toBe('Earth rises in 4 d 4 h')
  })

  it('reports a missing event and the outside state', () => {
    expect(bodyCountdown('sun', list, 31 * H, true, true).text).toBe('No sunset in data range')
    expect(bodyCountdown('sun', [], 0, true, false).text).toBe('No sunrise in data range')
    expect(bodyCountdown('earth', [], 0, true, true).text).toBe('No Earthset in data range')
    expect(bodyCountdown('earth', [], 0, true, false).text).toBe('No Earthrise in data range')
    expect(bodyCountdown('sun', list, 0, false, true)).toEqual({ text: 'Outside data range', event: null })
  })
})

describe('metric rows', () => {
  const metrics: ScenarioMetrics = {
    sun_el_deg: 1,
    sun_clearance_deg: 1,
    pct_sunlit: 62.54,
    mean_sun_frac: 60,
    longest_dark_h: 132,
    pct_earth: 50,
    longest_no_earth_h: 5.5,
    pct_both: 31.25,
    next_sunset_utc: null,
    next_sunrise_utc: null,
    next_earthset_utc: null,
    next_earthrise_utc: null,
    time_to_sunset_h: null,
    time_to_earthset_h: null,
    gaps: {},
  }

  it('formats window rows with units', () => {
    const rows = Object.fromEntries(windowMetricRows(metrics).map((r) => [r.key, r.value]))
    expect(rows.pct_sunlit).toBe('62.5 %')
    expect(rows.longest_dark_h).toBe('132 h')
    expect(rows.longest_no_earth_h).toBe('5.5 h')
    expect(rows.pct_both).toBe('31.3 %')
  })

  it('gives every row a definition', () => {
    for (const r of [...windowMetricRows(metrics), ...cursorMetricRows(1, 1)]) expect(r.tip.length).toBeGreaterThan(20)
  })

  it('formats cursor rows and shows a dash without a sample', () => {
    expect(cursorMetricRows(2.346, -0.5).map((r) => r.value)).toEqual(['+2.35 deg', '−0.50 deg'])
    expect(cursorMetricRows(null, null).map((r) => r.value)).toEqual(['—', '—'])
  })
})

