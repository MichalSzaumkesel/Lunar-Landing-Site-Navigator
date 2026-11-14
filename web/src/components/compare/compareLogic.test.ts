import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, SiteBundle } from '../../lib/types'
import type { Scenario } from '../../state/types'
import {
  COMPARE_CRITERIA,
  computeHighestHorizon,
  computeMinSunClearance,
  computeScenarioValues,
  findBetterScenarioIds,
  formatCriterionValue,
  sortScenariosByCriterion,
  type ScenarioCompareData,
} from './compareLogic'

function createMockHorizon(masks?: Record<string, number[]>): HorizonFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    az_step_deg: 90,
    n: 4,
    observer_heights_m: [2, 10],
    masks: masks ?? {
      '2': [0.5, 2.4, 1.2, 0.0],
      '10': [0.2, 1.8, 0.8, 0.0],
    },
  }
}

function createMockEphem(overrides?: Partial<EphemFile>): EphemFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 4,
    sun: {
      az: [0, 90, 180, 270],
      el: [1.5, 3.4, 2.2, 1.0],
    },
    earth: {
      az: [0, 0, 0, 0],
      el: [5.0, 5.0, 5.0, 5.0],
    },
    sun_ang_radius_deg: 0.266,
    earth_ang_radius_deg: 0.95,
    ...overrides,
  }
}

function createMockBundle(horizon?: HorizonFile, ephem?: EphemFile): SiteBundle {
  return {
    site: {
      id: 'shackleton',
      name: 'Shackleton Crater',
      category: 'artemis_region',
      mission: null,
      agency: null,
      country: null,
      lat_deg: -89.9,
      lon_deg: 0.0,
      elevation_m: null,
      landing_date_utc: null,
      status: 'candidate_region',
      region_radius_km: 10,
      source: { title: 'LRO', url: 'https://example.com' },
      notes: '',
    },
    horizon: horizon ?? createMockHorizon(),
    ephem: ephem ?? createMockEphem(),
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }
}

function createMockScenario(id: string, siteId = 'shackleton'): Scenario {
  return {
    id,
    siteId,
    startUtc: '2026-12-01T00:00:00Z',
    durationH: 3,
    slipDays: 0,
  }
}

describe('compareLogic', () => {
  describe('COMPARE_CRITERIA', () => {
    it('defines exactly 8 criteria with expected IDs and units', () => {
      expect(COMPARE_CRITERIA).toHaveLength(8)
      const ids = COMPARE_CRITERIA.map((c) => c.id)
      expect(ids).toEqual([
        'pct_sunlit',
        'longest_dark_h',
        'longest_no_earth_h',
        'pct_earth',
        'time_to_sunset_h',
        'time_to_earthset_h',
        'highest_horizon_el_deg',
        'min_sun_clearance_deg',
      ])
    })
  })

  describe('computeHighestHorizon', () => {
    it('finds maximum elevation in the observer height mask', () => {
      const horizon = createMockHorizon()
      expect(computeHighestHorizon(horizon, 2)).toBeCloseTo(2.4)
      expect(computeHighestHorizon(horizon, 10)).toBeCloseTo(1.8)
    })

    it('returns 0 for missing or empty masks', () => {
      expect(computeHighestHorizon(null, 2)).toBe(0)
      expect(computeHighestHorizon({ masks: {} }, 2)).toBe(0)
    })
  })

  describe('computeMinSunClearance', () => {
    it('computes minimum clearance over window samples', () => {
      const horizon = createMockHorizon()
      // mask: az 0->0.5, 90->2.4, 180->1.2, 270->0.0
      // sun el: az 0->1.5, 90->3.4, 180->2.2, 270->1.0
      // clearances: 1.5 - 0.5 = 1.0; 3.4 - 2.4 = 1.0; 2.2 - 1.2 = 1.0; 1.0 - 0.0 = 1.0
      const ephem = createMockEphem({
        sun: {
          az: [0, 90, 180, 270],
          el: [1.5, 3.4, 2.2, 0.5], // last sample: 0.5 - 0.0 = 0.5
        },
      })
      const bundle = createMockBundle(horizon, ephem)
      const t0 = Date.parse('2026-12-01T00:00:00Z')
      const tEnd = t0 + 4 * 3600_000

      const minClear = computeMinSunClearance(bundle, 2, t0, tEnd)
      expect(minClear).toBeCloseTo(0.5)
    })

    it('returns null when bundle is missing or window is empty', () => {
      expect(computeMinSunClearance(null, 2, 0, 1000)).toBeNull()
      const bundle = createMockBundle()
      expect(computeMinSunClearance(bundle, 2, 1000, 500)).toBeNull()
    })
  })

  describe('formatCriterionValue', () => {
    it('formats percentages with % unit', () => {
      expect(formatCriterionValue('pct_sunlit', 85.24)).toBe('85.2 %')
      expect(formatCriterionValue('pct_earth', 100)).toBe('100.0 %')
    })

    it('formats hours with h unit', () => {
      expect(formatCriterionValue('longest_dark_h', 12)).toBe('12 h')
      expect(formatCriterionValue('longest_dark_h', 12.5)).toBe('12.5 h')
      expect(formatCriterionValue('time_to_sunset_h', 4.2)).toBe('4.2 h')
    })

    it('formats degrees with deg unit and sign', () => {
      expect(formatCriterionValue('highest_horizon_el_deg', 2.4)).toBe('+2.40 deg')
      expect(formatCriterionValue('min_sun_clearance_deg', -0.85)).toBe('−0.85 deg')
      expect(formatCriterionValue('min_sun_clearance_deg', 1.2)).toBe('+1.20 deg')
    })

    it('handles null values with dash or neutral "None in range"', () => {
      expect(formatCriterionValue('pct_sunlit', null)).toBe('—')
      expect(
        formatCriterionValue('time_to_sunset_h', null, { gaps: { sunset: 'beyond_data' } } as any),
      ).toBe('None in range')
    })
  })

  describe('computeScenarioValues', () => {
    it('returns loading state when bundle is null', () => {
      const scenario = createMockScenario('s1')
      const result = computeScenarioValues(scenario, null, 2, 0)
      expect(result.status).toBe('loading')
      expect(result.values.pct_sunlit).toBeNull()
      expect(result.displayValues.pct_sunlit).toBe('—')
    })

    it('computes metrics and criteria for a valid bundle', () => {
      const scenario = createMockScenario('s1')
      const bundle = createMockBundle()
      const result = computeScenarioValues(scenario, bundle, 2, 0)
      expect(result.status).toBe('ready')
      expect(result.values.pct_sunlit).toBeGreaterThan(0)
      expect(result.values.highest_horizon_el_deg).toBeCloseTo(2.4)
      expect(result.values.min_sun_clearance_deg).not.toBeNull()
      expect(result.displayValues.pct_sunlit).toContain('%')
    })
  })

  describe('findBetterScenarioIds', () => {
    const critSunlit = COMPARE_CRITERIA.find((c) => c.id === 'pct_sunlit')!
    const critDark = COMPARE_CRITERIA.find((c) => c.id === 'longest_dark_h')!

    function makeData(id: string, values: Partial<Record<string, number | null>>): ScenarioCompareData {
      return {
        scenario: createMockScenario(id),
        bundle: null,
        status: 'ready',
        metrics: null,
        highestHorizonDeg: null,
        minSunClearanceDeg: null,
        values: values as any,
        displayValues: {} as any,
      }
    }

    it('highlights higher value when better is higher', () => {
      const s1 = makeData('s1', { pct_sunlit: 80.0 })
      const s2 = makeData('s2', { pct_sunlit: 95.0 })
      const result = findBetterScenarioIds(critSunlit, [s1, s2])
      expect(result.tag).toBe('higher')
      expect(result.betterScenarioIds.has('s2')).toBe(true)
      expect(result.betterScenarioIds.has('s1')).toBe(false)
    })

    it('highlights lower value when better is lower', () => {
      const s1 = makeData('s1', { longest_dark_h: 12.0 })
      const s2 = makeData('s2', { longest_dark_h: 0.0 })
      const result = findBetterScenarioIds(critDark, [s1, s2])
      expect(result.tag).toBe('lower')
      expect(result.betterScenarioIds.has('s2')).toBe(true)
      expect(result.betterScenarioIds.has('s1')).toBe(false)
    })

    it('does not highlight when values are equal (tie)', () => {
      const s1 = makeData('s1', { longest_dark_h: 0.0 })
      const s2 = makeData('s2', { longest_dark_h: 0.0 })
      const result = findBetterScenarioIds(critDark, [s1, s2])
      expect(result.betterScenarioIds.size).toBe(0)
      expect(result.tag).toBeNull()
    })

    it('does not highlight when fewer than 2 scenarios have valid values', () => {
      const s1 = makeData('s1', { pct_sunlit: 80.0 })
      const s2 = makeData('s2', { pct_sunlit: null })
      const result = findBetterScenarioIds(critSunlit, [s1, s2])
      expect(result.betterScenarioIds.size).toBe(0)
    })
  })

  describe('sortScenariosByCriterion', () => {
    function makeData(id: string, val: number | null): ScenarioCompareData {
      return {
        scenario: createMockScenario(id),
        bundle: null,
        status: 'ready',
        metrics: null,
        highestHorizonDeg: null,
        minSunClearanceDeg: null,
        values: { pct_sunlit: val } as any,
        displayValues: {} as any,
      }
    }

    it('sorts ascending and descending', () => {
      const s1 = makeData('s1', 70)
      const s2 = makeData('s2', 90)
      const s3 = makeData('s3', 80)

      const desc = sortScenariosByCriterion([s1, s2, s3], 'pct_sunlit', 'desc')
      expect(desc.map((d) => d.scenario.id)).toEqual(['s2', 's3', 's1'])

      const asc = sortScenariosByCriterion([s1, s2, s3], 'pct_sunlit', 'asc')
      expect(asc.map((d) => d.scenario.id)).toEqual(['s1', 's3', 's2'])
    })

    it('places null values at the end', () => {
      const s1 = makeData('s1', null)
      const s2 = makeData('s2', 90)
      const s3 = makeData('s3', 50)

      const desc = sortScenariosByCriterion([s1, s2, s3], 'pct_sunlit', 'desc')
      expect(desc.map((d) => d.scenario.id)).toEqual(['s2', 's3', 's1'])

      const asc = sortScenariosByCriterion([s1, s2, s3], 'pct_sunlit', 'asc')
      expect(asc.map((d) => d.scenario.id)).toEqual(['s3', 's2', 's1'])
    })

    it('preserves order when criterionId is null', () => {
      const s1 = makeData('s1', 10)
      const s2 = makeData('s2', 20)
      const result = sortScenariosByCriterion([s1, s2], null, 'asc')
      expect(result.map((d) => d.scenario.id)).toEqual(['s1', 's2'])
    })
  })
})
