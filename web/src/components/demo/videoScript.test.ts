import { describe, expect, it } from 'vitest'
import {
  BASE_STEP_DURATIONS,
  VIDEO_END_CARD_TITLE,
  planVideoSteps,
} from './videoScript'
import type { DemoStepContext } from './demoSteps'
import type { ScenarioMetrics, SiteBundle } from '../../lib/types'
import type { Scenario } from '../../state/types'

const FORBIDDEN_WORDS = /\b(power|energy|signal|link)\b/i

function makeMockScenario(id: string, siteId: string): Scenario {
  return {
    id,
    siteId,
    startUtc: '2027-08-30T00:00:00Z',
    durationH: 100,
    slipDays: 0,
  }
}

function makeMockBundle(siteId: string, name: string, synthetic = false): SiteBundle {
  const meta = {
    contract_version: '1.0.0',
    generated_utc: '2027-08-30T00:00:00Z',
    generator: 'test',
    synthetic,
    approximate: false,
    inputs: [],
  }
  return {
    site: {
      id: siteId,
      name,
      category: 'artemis_region',
      mission: null,
      agency: null,
      country: null,
      elevation_m: null,
      landing_date_utc: null,
      region_radius_km: null,
      lat_deg: -89.5,
      lon_deg: 0,
      status: 'planned',
      source: { title: 'Test source', url: '' },
      notes: '',
    },
    horizon: {
      site_id: siteId,
      meta,
      observer_heights_m: [2],
      n: 360,
      az_step_deg: 1,
      masks: { '2': new Array(360).fill(0) },
    },
    ephem: {
      site_id: siteId,
      meta,
      count: 2,
      step_minutes: 60,
      start_utc: '2027-08-30T00:00:00Z',
      sun_ang_radius_deg: 0.26,
      earth_ang_radius_deg: 0.95,
      sun: { az: [0, 0], el: [5, 5] },
      earth: { az: [180, 180], el: [10, 10] },
    },
    terrain: null,
    provenance: synthetic ? 'mock' : 'real',
    synthetic,
    approximate: false,
  }
}

function makeMockMetrics(): ScenarioMetrics {
  return {
    sun_el_deg: 1.5,
    sun_clearance_deg: 0.8,
    pct_sunlit: 50,
    mean_sun_frac: 50,
    longest_dark_h: 24,
    pct_earth: 75,
    longest_no_earth_h: 12,
    pct_both: 40,
    next_sunset_utc: '2027-08-30T18:00:00Z',
    next_sunrise_utc: '2027-08-31T06:00:00Z',
    next_earthset_utc: null,
    next_earthrise_utc: null,
    time_to_sunset_h: 18,
    time_to_earthset_h: null,
    gaps: {},
  }
}

describe('videoScript module', () => {
  it('defines base step durations table summing to 36000 ms', () => {
    expect(BASE_STEP_DURATIONS.length).toBe(6)
    const sum = BASE_STEP_DURATIONS.reduce((a, b) => a + b, 0)
    expect(sum).toBe(36000)
  })

  describe('planVideoSteps', () => {
    it('sums to total within 1 ms for 30000 ms', () => {
      const steps = planVideoSteps(30000)
      expect(steps.length).toBe(6)
      const sum = steps.reduce((acc, step) => acc + step.durationMs, 0)
      expect(Math.abs(sum - 30000)).toBeLessThanOrEqual(1)
      expect(sum).toBe(30000)
    })

    it('sums to total within 1 ms for 20000 ms', () => {
      const steps = planVideoSteps(20000)
      expect(steps.length).toBe(6)
      const sum = steps.reduce((acc, step) => acc + step.durationMs, 0)
      expect(Math.abs(sum - 20000)).toBeLessThanOrEqual(1)
      expect(sum).toBe(20000)
    })

    it('last step is the end card showing project name and "NASA Space Apps 2026"', () => {
      const steps = planVideoSteps(30000)
      const lastStep = steps[steps.length - 1]
      expect(lastStep.id).toBe('step-6-end-card')

      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11')],
        bundles: [makeMockBundle('apollo_11', 'Apollo 11', false)],
        metrics: [makeMockMetrics()],
        events: [[]],
        isSynthetic: false,
      }

      const caption = lastStep.caption(ctx)
      expect(caption).toContain('Lunar Landing Site Navigator')
      expect(caption).toContain('NASA Space Apps 2026')
      expect(caption).toBe(VIDEO_END_CARD_TITLE)
      expect(caption).not.toMatch(FORBIDDEN_WORDS)
    })

    it('last step appends (demo data) when synthetic is true', () => {
      const steps = planVideoSteps(30000)
      const lastStep = steps[steps.length - 1]

      const ctxSynthetic: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'mock_site')],
        bundles: [makeMockBundle('mock_site', 'Mock Site', true)],
        metrics: [makeMockMetrics()],
        events: [[]],
        isSynthetic: true,
      }

      const caption = lastStep.caption(ctxSynthetic)
      expect(caption).toContain('Lunar Landing Site Navigator — NASA Space Apps 2026')
      expect(caption).toContain('(demo data)')
      expect(caption).not.toMatch(FORBIDDEN_WORDS)
    })

    it('all captions follow wording rule with no forbidden words', () => {
      const steps = planVideoSteps(30000)
      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11'), makeMockScenario('s2', 'artemis_1')],
        bundles: [makeMockBundle('apollo_11', 'Apollo 11'), makeMockBundle('artemis_1', 'Artemis 1')],
        metrics: [makeMockMetrics(), makeMockMetrics()],
        events: [[], []],
        isSynthetic: false,
      }

      for (const step of steps) {
        const text = step.caption(ctx)
        expect(text).toBeTruthy()
        expect(text).not.toMatch(FORBIDDEN_WORDS)
      }
    })
  })
})
