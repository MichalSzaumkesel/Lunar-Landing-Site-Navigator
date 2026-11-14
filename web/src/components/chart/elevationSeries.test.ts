import { describe, expect, it } from 'vitest'
import {
  computeElevationSeries,
  computeRangeBounds,
  earthStatusText,
  formatElevationDeg,
  formatUtcDateTime,
  limitTableRows,
  sampleElevationAt,
  sunStatusText,
  type ElevationPoint,
} from './elevationSeries'
import type { EphemFile, HorizonFile, SiteBundle } from '../../lib/types'

function makeMockBundle(): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const ephem: EphemFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test-site',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 240, // 10 days
    sun: {
      az: Array.from({ length: 240 }, (_, i) => (i * 1.5) % 360),
      el: Array.from({ length: 240 }, (_, i) => 2 + Math.sin((i / 24) * Math.PI * 2) * 5),
    },
    earth: {
      az: Array.from({ length: 240 }, () => 180),
      el: Array.from({ length: 240 }, () => 12),
    },
    sun_ang_radius_deg: 0.26,
    earth_ang_radius_deg: 0.95,
  }

  const horizon: HorizonFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test-site',
    az_step_deg: 1,
    n: 360,
    observer_heights_m: [2, 10],
    masks: {
      '2': Array.from({ length: 360 }, () => 1.5), // flat 1.5 deg horizon
      '10': Array.from({ length: 360 }, () => 1.0),
    },
  }

  return { ephem, horizon }
}

describe('elevationSeries calculations', () => {
  describe('computeRangeBounds', () => {
    it('returns [0, durationH] for "window" mode', () => {
      expect(computeRangeBounds(10, 72, 'window')).toEqual({ startH: 0, endH: 72 })
      expect(computeRangeBounds(0, 240, 'window')).toEqual({ startH: 0, endH: 240 })
    })

    it('returns [0, durationH] when duration is smaller than requested span', () => {
      expect(computeRangeBounds(5, 18, '24h')).toEqual({ startH: 0, endH: 18 })
      expect(computeRangeBounds(20, 100, '7d')).toEqual({ startH: 0, endH: 100 })
    })

    it('centers 24 h window around cursor, clamping to start when cursor is near 0', () => {
      const b1 = computeRangeBounds(2, 100, '24h')
      expect(b1).toEqual({ startH: 0, endH: 24 })
    })

    it('centers 24 h window around cursor when cursor is in the middle', () => {
      const b2 = computeRangeBounds(30, 100, '24h')
      expect(b2).toEqual({ startH: 18, endH: 42 })
    })

    it('clamps 24 h window to end when cursor is near duration end', () => {
      const b3 = computeRangeBounds(95, 100, '24h')
      expect(b3).toEqual({ startH: 76, endH: 100 })
    })

    it('centers 7 d window (168 h) around cursor with proper clamping', () => {
      const b1 = computeRangeBounds(10, 300, '7d')
      expect(b1).toEqual({ startH: 0, endH: 168 })

      const b2 = computeRangeBounds(150, 300, '7d')
      expect(b2).toEqual({ startH: 66, endH: 234 })

      const b3 = computeRangeBounds(290, 300, '7d')
      expect(b3).toEqual({ startH: 132, endH: 300 })
    })
  })

  describe('formatElevationDeg and status text', () => {
    it('formats positive and negative degrees with unit °', () => {
      expect(formatElevationDeg(4.25)).toBe('+4.3°')
      expect(formatElevationDeg(-1.84)).toBe('-1.8°')
      expect(formatElevationDeg(0)).toBe('0.0°')
      expect(formatElevationDeg(NaN)).toBe('—')
    })

    it('strictly follows wording rules for Sun and Earth status', () => {
      expect(sunStatusText(true)).toBe('Sun visible')
      expect(sunStatusText(false)).toBe('Sun below horizon')
      expect(earthStatusText(true)).toBe('Earth in view')
      expect(earthStatusText(false)).toBe('Earth below horizon')

      const forbidden = ['power', 'energy', 'signal', 'link', 'best']
      for (const f of forbidden) {
        expect(sunStatusText(true).toLowerCase()).not.toContain(f)
        expect(sunStatusText(false).toLowerCase()).not.toContain(f)
        expect(earthStatusText(true).toLowerCase()).not.toContain(f)
        expect(earthStatusText(false).toLowerCase()).not.toContain(f)
      }
    })

    it('formats UTC date time strings with UTC label', () => {
      const ms = Date.parse('2026-12-01T14:30:00Z')
      expect(formatUtcDateTime(ms)).toBe('2026-12-01 14:30 UTC')
    })
  })

  describe('sampleElevationAt', () => {
    it('computes clearance against terrain horizon mask', () => {
      const bundle = makeMockBundle()
      const baseMs = Date.parse('2026-12-01T00:00:00Z')
      const pt = sampleElevationAt(bundle, 2, baseMs, baseMs)

      expect(pt).not.toBeNull()
      if (pt) {
        expect(pt.relH).toBe(0)
        expect(pt.timeMs).toBe(baseMs)
        expect(pt.sunHorizonElDeg).toBe(1.5)
        // at i=0, sun el = 2. Clearance = 2 - 1.5 = +0.5
        expect(pt.sunClearanceDeg).toBeCloseTo(0.5)
        expect(pt.sunVisible).toBe(true)

        // earth at 12 deg el, horizon at 1.5 deg -> clearance = 10.5
        expect(pt.earthClearanceDeg).toBeCloseTo(10.5)
        expect(pt.earthVisible).toBe(true)
      }
    })
  })

  describe('computeElevationSeries', () => {
    it('returns hourly points within window bounds', () => {
      const bundle = makeMockBundle()
      const baseMs = Date.parse('2026-12-01T00:00:00Z')
      const series = computeElevationSeries(bundle, 2, baseMs, 0, 24)

      expect(series.length).toBe(25) // 0h to 24h inclusive
      expect(series[0].relH).toBe(0)
      expect(series[24].relH).toBe(24)
      expect(series[0].utcIso).toBe('2026-12-01 00:00 UTC')
      expect(series[24].utcIso).toBe('2026-12-02 00:00 UTC')
    })
  })

  describe('limitTableRows', () => {
    it('limits rows to at most 200 items', () => {
      const mockPoints = Array.from({ length: 300 }, (_, i) => ({
        relH: i,
        timeMs: i * 3600_000,
        utcIso: `${i}`,
        sunClearanceDeg: 1,
        earthClearanceDeg: 2,
        sunElDeg: 3,
        earthElDeg: 4,
        sunHorizonElDeg: 1,
        earthHorizonElDeg: 1,
        sunVisible: true,
        earthVisible: true,
      })) as ElevationPoint[]

      const limited = limitTableRows(mockPoints, 200)
      expect(limited.length).toBe(200)
      expect(limited[0].relH).toBe(0)
      expect(limited[199].relH).toBe(199)

      const small = limitTableRows(mockPoints.slice(0, 50), 200)
      expect(small.length).toBe(50)
    })
  })
})
