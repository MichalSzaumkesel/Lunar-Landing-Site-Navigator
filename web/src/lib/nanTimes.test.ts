import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, SiteBundle } from './types'
import { sampleAt } from './ephem'
import { computeMetrics } from './metrics'
import { computeWindowMap, type WindowMapInput } from './windowMap'

const meta = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: true,
  approximate: false,
  inputs: [],
}
const T0 = Date.UTC(2027, 0, 1)
const HOUR = 3_600_000

const ephem: EphemFile = {
  meta,
  site_id: 's',
  start_utc: '2027-01-01T00:00:00Z',
  step_minutes: 60,
  count: 4,
  sun: { az: [0, 0, 0, 0], el: [10, 5, -5, -10] },
  earth: { az: [0, 0, 0, 0], el: [10, 10, 10, 10] },
  sun_ang_radius_deg: 0.2666,
  earth_ang_radius_deg: 0.95,
}
const horizon: HorizonFile = {
  meta,
  site_id: 's',
  az_step_deg: 360,
  n: 1,
  observer_heights_m: [2, 10],
  masks: { '2': [0], '10': [0] },
}
const bundle = { ephem, horizon } as Pick<SiteBundle, 'horizon' | 'ephem'>
const rules = { observerHeightM: 2 } as never

describe('non-finite times degrade safely', () => {
  it('sampleAt returns null for NaN and infinite times, and still interpolates valid ones', () => {
    expect(sampleAt(ephem, NaN)).toBeNull()
    expect(sampleAt(ephem, Infinity)).toBeNull()
    expect(sampleAt(ephem, -Infinity)).toBeNull()
    // Half way between samples 0 and 1: sun el (10 + 5) / 2 = 7.5
    expect(sampleAt(ephem, T0 + HOUR / 2)?.sun.el).toBeCloseTo(7.5, 9)
  })

  it('computeMetrics returns null for a NaN window bound or reference time', () => {
    expect(computeMetrics(bundle, { observerHeightM: 2, startMs: NaN, endMs: T0 + 3 * HOUR })).toBeNull()
    expect(computeMetrics(bundle, { observerHeightM: 2, startMs: T0, endMs: NaN })).toBeNull()
    expect(computeMetrics(bundle, { observerHeightM: 2, startMs: T0, endMs: T0 + 3 * HOUR, refMs: NaN })).toBeNull()
  })

  it('computeMetrics still works for a valid window', () => {
    const m = computeMetrics(bundle, { observerHeightM: 2, startMs: T0, endMs: T0 + 3 * HOUR })
    expect(m).not.toBeNull()
    expect(Number.isFinite(m!.pct_sunlit)).toBe(true)
    // Samples at 0 h, 1 h, 2 h (end excluded): sun el 10, 5, -5 -> 2 of 3 above a flat 0 deg horizon.
    expect(m!.pct_sunlit).toBeGreaterThan(50)
    expect(m!.pct_sunlit).toBeLessThan(80)
  })

  it.each([
    ['startMs', { startMs: NaN }],
    ['endMs', { endMs: NaN }],
  ])('computeWindowMap returns empty rows for a NaN %s', (_name, opts) => {
    const inputs: WindowMapInput[] = [{ siteId: 's', bundle }]
    let rows: ReturnType<typeof computeWindowMap> = []
    expect(() => {
      rows = computeWindowMap(inputs, rules, opts)
    }).not.toThrow()
    expect(rows).toHaveLength(1)
    expect(rows[0].siteId).toBe('s')
    expect(rows[0].count).toBe(0)
    expect(rows[0].pctSunlit).toHaveLength(0)
    expect(Number.isNaN(rows[0].startMs)).toBe(false)
  })

  it('computeWindowMap without bounds still returns the full coverage', () => {
    const rows = computeWindowMap([{ siteId: 's', bundle }], rules)
    expect(rows[0].count).toBeGreaterThan(0)
    expect(rows[0].startMs).toBe(T0)
  })
})
