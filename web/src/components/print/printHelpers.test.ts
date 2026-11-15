import { describe, expect, it } from 'vitest'
import type { MissionRules, ScenarioMetrics, SiteBundle } from '../../lib/types'
import type { MastDeltaResult } from '../../lib/mastDelta'
import type { SkySample } from '../../lib/ephem'
import {
  evaluateMissionRules,
  formatMastGainText,
  formatPrintCoords,
  formatPrintTimestamp,
  formatProvenance,
  formatScenarioDateRange,
  formatUnitValue,
  getPrintMetricRows,
  validateWordingText,
  PRINT_FOOTER_TEXT,
} from './printHelpers'

describe('printHelpers', () => {
  describe('date and timestamp formatting', () => {
    it('formats print timestamp in UTC format', () => {
      const ts = formatPrintTimestamp('2026-11-14T11:53:00.000Z')
      expect(ts).toBe('2026-11-14 11:53 UTC')
      expect(ts).toContain('UTC')
    })

    it('formats scenario date range in UTC format with duration and slip', () => {
      const startMs = Date.parse('2026-11-14T00:00:00Z')
      const endMs = Date.parse('2026-11-28T00:00:00Z')
      const range = formatScenarioDateRange(startMs, endMs, 2)
      expect(range).toBe('2026-11-14 to 2026-11-28 UTC (14 d, slip +2 d)')
      expect(range).toContain('UTC')
    })

    it('omits slip text when slip is zero', () => {
      const startMs = Date.parse('2026-11-14T00:00:00Z')
      const endMs = Date.parse('2026-11-28T00:00:00Z')
      const range = formatScenarioDateRange(startMs, endMs, 0)
      expect(range).toBe('2026-11-14 to 2026-11-28 UTC (14 d)')
      expect(range).toContain('UTC')
    })
  })

  describe('coordinate formatting', () => {
    it('formats south/east coordinates correctly', () => {
      expect(formatPrintCoords(-89.9, 12.3)).toBe('89.90° S, 12.30° E')
    })

    it('formats north/west coordinates correctly', () => {
      expect(formatPrintCoords(0.674, -23.473)).toBe('0.67° N, 23.47° W')
    })
  })

  describe('unit values and empty/null handling', () => {
    it('attaches unit to numeric values', () => {
      expect(formatUnitValue(12.34, 'deg', 2, true)).toBe('+12.34 deg')
      expect(formatUnitValue(-5.1, 'deg', 1, true)).toBe('−5.1 deg')
      expect(formatUnitValue(85.6, '%', 1)).toBe('85.6 %')
      expect(formatUnitValue(24, 'h', 0)).toBe('24 h')
    })

    it('displays outside data range for null, undefined or NaN values', () => {
      expect(formatUnitValue(null, 'deg')).toBe('outside data range')
      expect(formatUnitValue(undefined, '%')).toBe('outside data range')
      expect(formatUnitValue(Number.NaN, 'h')).toBe('outside data range')
    })
  })

  describe('mast gain text and wording rule', () => {
    it('formats positive mast delta gain without power claims', () => {
      const delta: MastDeltaResult = {
        sunHours2: 100,
        sunHours10: 108.5,
        gainH: 8.5,
        longestDark2H: 24,
        longestDark10H: 18,
      }
      const text = formatMastGainText(delta)
      expect(text).toBe('+8.5 h Sun visible')
      expect(validateWordingText(text).valid).toBe(true)
    })

    it('formats zero/negligible gain as no difference', () => {
      const delta: MastDeltaResult = {
        sunHours2: 100,
        sunHours10: 100.02,
        gainH: 0.02,
        longestDark2H: 24,
        longestDark10H: 24,
      }
      expect(formatMastGainText(delta)).toBe('No difference')
    })

    it('returns outside data range for null delta', () => {
      expect(formatMastGainText(null)).toBe('outside data range')
    })
  })

  describe('getPrintMetricRows', () => {
    const mockMetrics: ScenarioMetrics = {
      sun_el_deg: 1.5,
      sun_clearance_deg: 0.8,
      pct_sunlit: 82.5,
      mean_sun_frac: 79.1,
      longest_dark_h: 24,
      pct_earth: 95.0,
      longest_no_earth_h: 0,
      pct_both: 78.4,
      next_sunset_utc: null,
      next_sunrise_utc: null,
      next_earthset_utc: null,
      next_earthrise_utc: null,
      time_to_sunset_h: null,
      time_to_earthset_h: null,
      gaps: {},
    }

    const mockCursor = { sunElDeg: 2.15, sunClearanceDeg: 1.45 }
    const mockMast: MastDeltaResult = {
      sunHours2: 200,
      sunHours10: 203.2,
      gainH: 3.2,
      longestDark2H: 12,
      longestDark10H: 10,
    }

    it('formats all 10 metrics with correct units when data is present', () => {
      const rows = getPrintMetricRows(mockMetrics, mockCursor, mockMast, null, { pct: 78.4, longestH: 30, samples: 720 })
      expect(rows).toHaveLength(10)

      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
      expect(map.sun_el_deg).toBe('+2.15 deg')
      expect(map.sun_clearance_deg).toBe('+1.45 deg')
      expect(map.pct_sunlit).toBe('82.5 %')
      expect(map.mean_sun_frac).toBe('79.1 %')
      expect(map.longest_dark_h).toBe('24 h')
      expect(map.pct_earth).toBe('95.0 %')
      expect(map.longest_no_earth_h).toBe('0 h')
      expect(map.pct_both).toBe('78.4 %')
      expect(map.mast_gain).toBe('+3.2 h Sun visible')
      expect(map.both_derived).toBe('78.4 % of window; longest 30 h')
      expect(rows.find((r) => r.key === 'both_derived')!.label).toMatch(/\(derived\)$/)
    })

    it('returns outside data range for all metrics when data is null', () => {
      const rows = getPrintMetricRows(null, null, null)
      expect(rows).toHaveLength(10)
      for (const row of rows) {
        expect(row.value).toBe('outside data range')
      }
    })

    it('satisfies the wording rule: no power, energy, signal or link claims in rows', () => {
      const rows = getPrintMetricRows(mockMetrics, mockCursor, mockMast)
      for (const row of rows) {
        const checkLabel = validateWordingText(row.label)
        expect(checkLabel.valid).toBe(true)
        const checkValue = validateWordingText(row.value)
        expect(checkValue.valid).toBe(true)
      }
    })
  })

  describe('provenance formatting', () => {
    it('formats mock provenance with source id', () => {
      const bundle = {
        site: { id: 'shackleton', source: { title: 'Synthetic Shackleton', url: '' } },
        provenance: 'mock',
        synthetic: true,
        approximate: false,
      } as unknown as SiteBundle
      const p = formatProvenance(bundle)
      expect(p).toContain('Mock data')
      expect(p).toContain('shackleton')
    })

    it('formats real provenance with DEM product', () => {
      const bundle = {
        site: { id: 'malapert_summit' },
        horizon: { dem: { product: 'LOLA_30m' } },
        ephem: { horizons_query: { COMMAND: '301' } },
        provenance: 'real',
        synthetic: false,
        approximate: false,
      } as unknown as SiteBundle
      const p = formatProvenance(bundle)
      expect(p).toContain('Real data')
      expect(p).toContain('malapert_summit')
      expect(p).toContain('LOLA_30m')
    })

    it('formats approximate provenance', () => {
      const bundle = {
        site: { id: 'custom_1' },
        provenance: 'custom_approx',
        synthetic: false,
        approximate: true,
      } as unknown as SiteBundle
      const p = formatProvenance(bundle)
      expect(p).toContain('Approximate')
      expect(p).toContain('custom_1')
    })
  })

  describe('mission rules evaluation', () => {
    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 240,
      minPctSunlit: 70,
      maxLongestDarkH: 48,
      earthAtLandingRequired: true,
      minPctEarth: 50,
      minSunElAtLandingDeg: 1.0,
    }

    const passingMetrics: ScenarioMetrics = {
      sun_el_deg: 2.0,
      sun_clearance_deg: 1.0,
      pct_sunlit: 75.0,
      mean_sun_frac: 74.0,
      longest_dark_h: 24,
      pct_earth: 60.0,
      longest_no_earth_h: 12,
      pct_both: 55.0,
      next_sunset_utc: null,
      next_sunrise_utc: null,
      next_earthset_utc: null,
      next_earthrise_utc: null,
      time_to_sunset_h: null,
      time_to_earthset_h: null,
      gaps: {},
    }

    const passingSample: SkySample = {
      sun: { az: 45, el: 2.5 },
      earth: { az: 180, el: 5.0 },
    }

    const flatHorizon = new Array(360).fill(0)

    it('evaluates all rules as met when metrics and start sample pass', () => {
      const result = evaluateMissionRules(
        rules,
        passingMetrics,
        passingSample,
        flatHorizon,
        1,
        240,
      )
      expect(result.allMet).toBe(true)
      expect(result.statusText).toBe('All rules met')
      for (const r of result.rules) {
        expect(r.met).toBe(true)
      }
    })

    it('rejects a landing when the Sun is above 0 deg but below the terrain horizon', () => {
      const ridge = new Array(360).fill(3)
      const result = evaluateMissionRules(rules, passingMetrics, passingSample, ridge, 1, 240)
      const sunRule = result.rules.find((r) => r.key === 'minSunElAtLanding')
      expect(sunRule?.met).toBe(false)
      expect(result.allMet).toBe(false)
    })

    it('evaluates as not met when sunlit percentage is below threshold', () => {
      const lowSunMetrics = { ...passingMetrics, pct_sunlit: 65.0 }
      const result = evaluateMissionRules(
        rules,
        lowSunMetrics,
        passingSample,
        flatHorizon,
        1,
        240,
      )
      expect(result.allMet).toBe(false)
      expect(result.statusText).toBe('Rules not met')
      const sunlitRule = result.rules.find((r) => r.key === 'minPctSunlit')
      expect(sunlitRule?.met).toBe(false)
    })

    it('evaluates as not met when earth is below horizon at landing', () => {
      const earthBelowSample: SkySample = {
        sun: { az: 45, el: 2.5 },
        earth: { az: 180, el: -2.0 }, // below flat horizon
      }
      const result = evaluateMissionRules(
        rules,
        passingMetrics,
        earthBelowSample,
        flatHorizon,
        1,
        240,
      )
      expect(result.allMet).toBe(false)
      const earthLanding = result.rules.find((r) => r.key === 'earthAtLanding')
      expect(earthLanding?.met).toBe(false)
      expect(earthLanding?.actual).toBe('Earth below horizon')
    })

    it('evaluates as not met when metrics is null (outside data range)', () => {
      const result = evaluateMissionRules(
        rules,
        null,
        null,
        flatHorizon,
        1,
        240,
      )
      expect(result.allMet).toBe(false)
      expect(result.statusText).toBe('Rules not met')
    })
  })

  describe('footer text and wording rules', () => {
    it('has the exact required footer disclaimer', () => {
      expect(PRINT_FOOTER_TEXT).toBe(
        'Sun visible and Earth in view only, not a power or link guarantee.',
      )
    })
  })
})

describe('getPrintMetricRows with a horizon range', () => {
  const m = { pct_sunlit: 52.14, pct_earth: 80, mean_sun_frac: 50, longest_dark_h: 1, longest_no_earth_h: 0, pct_both: 40 } as never
  const range = { uncertaintyDeg: 0.15, sun: { lo: 50.94, hi: 53.04 }, earth: { lo: 79.2, hi: 80.8 } }
  it('appends the range to the two shares only', () => {
    const rows = getPrintMetricRows(m, null, null, range)
    expect(rows.find((r) => r.key === 'pct_sunlit')?.value).toBe('52.1 % (50.9–53.0)')
    expect(rows.find((r) => r.key === 'pct_earth')?.value).toBe('80.0 % (79.2–80.8)')
    expect(rows.find((r) => r.key === 'pct_both')?.value).toBe('40.0 %')
  })
  it('adds nothing without a range', () => {
    expect(getPrintMetricRows(m, null, null, null).find((r) => r.key === 'pct_sunlit')?.value).toBe('52.1 %')
  })
})
