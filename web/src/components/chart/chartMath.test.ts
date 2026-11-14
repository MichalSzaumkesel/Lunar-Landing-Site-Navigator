import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, SiteBundle } from '../../lib/types'
import {
  computeElevationSeries,
  filterSeriesByRange,
  getTimeRange,
} from './chartMath'

function makeTestBundle(): Pick<SiteBundle, 'ephem' | 'horizon'> {
  const count = 25
  const stepMinutes = 60
  const startUtc = '2026-11-14T00:00:00Z'

  const sunAz = new Array(count).fill(0).map((_, i) => i * 15)
  const sunEl = new Array(count).fill(0).map((_, i) => -5 + i * 0.5) // -5 to +7 deg
  const earthAz = new Array(count).fill(0).map((_, i) => 180 + i * 2)
  const earthEl = new Array(count).fill(0).map((_, i) => 10 - i * 0.2) // +10 to +5.2 deg

  const ephem: EphemFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    start_utc: startUtc,
    step_minutes: stepMinutes,
    count,
    sun_ang_radius_deg: 0.26,
    earth_ang_radius_deg: 0.95,
    sun: { az: sunAz, el: sunEl },
    earth: { az: earthAz, el: earthEl },
  }

  // Horizon: constant 1.0 deg elevation across all 360 azimuths
  const horizon: HorizonFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    az_step_deg: 1,
    n: 360,
    observer_heights_m: [2, 10],
    masks: {
      '2': new Array(360).fill(1.0),
      '10': new Array(360).fill(0.5),
    },
  }

  return { ephem, horizon }
}

describe('chartMath', () => {
  describe('computeElevationSeries', () => {
    it('computes hourly elevation series with clearances and visibility states', () => {
      const bundle = makeTestBundle()
      const startMs = Date.parse('2026-11-14T00:00:00Z')
      const endMs = Date.parse('2026-11-15T00:00:00Z') // 24 hours later = 25 points

      const series = computeElevationSeries(bundle, 2, startMs, endMs, 60)
      expect(series.length).toBe(25)

      // First point: sun El = -5, horizon = 1 -> clearance = -6
      const p0 = series[0]
      expect(p0.hoursFromStart).toBe(0)
      expect(p0.sunEl).toBe(-5)
      expect(p0.sunHorizonEl).toBe(1)
      expect(p0.sunClearance).toBeCloseTo(-6)
      expect(p0.sunVisible).toBe(false)

      // Earth at p0: earth El = 10, horizon = 1 -> clearance = 9
      expect(p0.earthEl).toBe(10)
      expect(p0.earthClearance).toBeCloseTo(9)
      expect(p0.earthVisible).toBe(true)

      // Point at 12h: sun El = -5 + 12 * 0.5 = +1.0, horizon = 1.0 -> clearance = 0.0
      const p12 = series[12]
      expect(p12.sunClearance).toBeCloseTo(0)
      expect(p12.sunVisible).toBe(true)

      // Point at 24h: sun El = +7, horizon = 1 -> clearance = +6
      const p24 = series[24]
      expect(p24.hoursFromStart).toBe(24)
      expect(p24.sunClearance).toBeCloseTo(6)
      expect(p24.sunVisible).toBe(true)
    })

    it('returns empty array when endMs < startMs', () => {
      const bundle = makeTestBundle()
      const series = computeElevationSeries(bundle, 2, 1000, 500)
      expect(series).toEqual([])
    })

    it('accounts for 10m observer height having lower horizon', () => {
      const bundle = makeTestBundle()
      const startMs = Date.parse('2026-11-14T00:00:00Z')
      const endMs = startMs + 3600_000

      const series2m = computeElevationSeries(bundle, 2, startMs, endMs)
      const series10m = computeElevationSeries(bundle, 10, startMs, endMs)

      expect(series2m[0].sunHorizonEl).toBe(1.0)
      expect(series10m[0].sunHorizonEl).toBe(0.5)
      // 10m height has 0.5 deg more clearance
      expect(series10m[0].sunClearance).toBeCloseTo(series2m[0].sunClearance + 0.5)
    })
  })

  describe('getTimeRange', () => {
    const startMs = 0
    const endMs = 14 * 24 * 3600_000 // 14 days

    it('returns entire window when range is "window"', () => {
      const { rangeStartMs, rangeEndMs } = getTimeRange('window', 5 * 24 * 3600_000, startMs, endMs)
      expect(rangeStartMs).toBe(startMs)
      expect(rangeEndMs).toBe(endMs)
    })

    it('centers 24h around cursor within bounds', () => {
      const cursorMs = 3 * 24 * 3600_000
      const { rangeStartMs, rangeEndMs } = getTimeRange('24h', cursorMs, startMs, endMs)
      const span = rangeEndMs - rangeStartMs
      expect(span).toBe(24 * 3600_000)
      expect(rangeStartMs).toBe(cursorMs - 12 * 3600_000)
      expect(rangeEndMs).toBe(cursorMs + 12 * 3600_000)
    })

    it('clamps 24h range at start when cursor is near window start', () => {
      const cursorMs = 2 * 3600_000 // 2h from start
      const { rangeStartMs, rangeEndMs } = getTimeRange('24h', cursorMs, startMs, endMs)
      expect(rangeStartMs).toBe(0)
      expect(rangeEndMs).toBe(24 * 3600_000)
    })

    it('clamps 24h range at end when cursor is near window end', () => {
      const cursorMs = endMs - 2 * 3600_000
      const { rangeStartMs, rangeEndMs } = getTimeRange('24h', cursorMs, startMs, endMs)
      expect(rangeEndMs).toBe(endMs)
      expect(rangeStartMs).toBe(endMs - 24 * 3600_000)
    })

    it('returns entire window if window is shorter than requested 7d span', () => {
      const shortEnd = 3 * 24 * 3600_000
      const { rangeStartMs, rangeEndMs } = getTimeRange('7d', 1 * 24 * 3600_000, 0, shortEnd)
      expect(rangeStartMs).toBe(0)
      expect(rangeEndMs).toBe(shortEnd)
    })
  })

  describe('filterSeriesByRange', () => {
    it('filters points strictly within range', () => {
      const pts = [
        { tMs: 100 } as any,
        { tMs: 200 } as any,
        { tMs: 300 } as any,
        { tMs: 400 } as any,
      ]
      const filtered = filterSeriesByRange(pts, 200, 300)
      expect(filtered.map((p) => p.tMs)).toEqual([200, 300])
    })
  })
})
