import { describe, expect, it, vi } from 'vitest'
import type { ScenarioMetrics, SiteBundle } from '../../lib/types'
import type { AppStore, Scenario } from '../../state/types'
import {
  DEMO_STEPS,
  appendDemoDataNotice,
  findFirstSunsetH,
  findSunsetCursorH,
  SUNSET_LEAD_H,
  formatHoursWithUnit,
  formatStep1Caption,
  formatStep2Caption,
  formatStep3Caption,
  formatPercent,
  formatStep4Caption,
  formatStep5Caption,
  formatStep6Caption,
  type DemoStepContext,
} from './demoSteps'

const FORBIDDEN_WORDS = /\b(power|energy|signal|link)\b/i

function makeMockScenario(id: string, siteId: string, durationH = 720, slipDays = 0): Scenario {
  return {
    id,
    siteId,
    startUtc: '2027-08-30T00:00:00Z',
    durationH,
    slipDays,
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
      count: 100,
      step_minutes: 60,
      start_utc: '2027-08-30T00:00:00Z',
      sun_ang_radius_deg: 0.26,
      earth_ang_radius_deg: 0.95,
      sun: { az: new Array(100).fill(0), el: new Array(100).fill(5) },
      earth: { az: new Array(100).fill(180), el: new Array(100).fill(10) },
    },
    terrain: null,
    provenance: synthetic ? 'mock' : 'real',
    synthetic,
    approximate: false,
  }
}

function makeMockMetrics(overrides?: Partial<ScenarioMetrics>): ScenarioMetrics {
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
    ...overrides,
  }
}

describe('demoSteps', () => {
  it('step list is non-empty', () => {
    expect(DEMO_STEPS.length).toBeGreaterThanOrEqual(6)
  })

  it('every caption function returns text without forbidden words (power, energy, signal, link)', () => {
    const scenarios = [
      makeMockScenario('s1', 'apollo_11', 100),
      makeMockScenario('s2', 'artemis_region_1', 100),
    ]
    const bundles = [
      makeMockBundle('apollo_11', 'Apollo 11'),
      makeMockBundle('artemis_region_1', 'Artemis region 1'),
    ]
    const metrics = [
      makeMockMetrics({ pct_sunlit: 60, pct_earth: 80 }),
      makeMockMetrics({ pct_sunlit: 40, pct_earth: 30 }),
    ]
    const t0 = Date.parse('2027-08-30T00:00:00Z')
    const events = [
      [],
      [{ kind: 'sunset' as const, ms: t0 + 18 * 3600000, utc: '2027-08-30T18:00:00Z' }],
    ]

    for (const isSynthetic of [false, true]) {
      const ctx: DemoStepContext = {
        scenarios,
        bundles,
        metrics,
        events,
        isSynthetic,
      }

      for (const step of DEMO_STEPS) {
        const text = step.caption(ctx)
        expect(text).toBeTruthy()
        expect(text).not.toMatch(FORBIDDEN_WORDS)
      }
    }
  })

  describe('pure helpers for captions and numbers', () => {
    it('formatStep4Caption numbers equal the metrics passed in', () => {
      const scenarios = [
        makeMockScenario('s1', 'apollo_11', 200), // durationH = 200
        makeMockScenario('s2', 'artemis_region_1', 200), // durationH = 200
      ]

      // s1: 60% of 200h = 120h Sun, 75% of 200h = 150h Earth
      const m1 = makeMockMetrics({ pct_sunlit: 60, pct_earth: 75 })
      // s2: 30% of 200h = 60h Sun, 25% of 200h = 50h Earth
      const m2 = makeMockMetrics({ pct_sunlit: 30, pct_earth: 25 })

      const caption = formatStep4Caption(scenarios, [m1, m2], false)

      expect(caption).toContain('Sun visible: 60.0 % vs 30.0 %')
      expect(caption).toContain('Earth in view: 75.0 % vs 25.0 %')
      expect(caption).toContain('Sun visible')
      expect(caption).toContain('Earth in view')
      expect(caption).not.toMatch(FORBIDDEN_WORDS)
    })

    it('formatStep5Caption numbers equal the metrics passed in (delta)', () => {
      const scenarios = [
        makeMockScenario('s1', 'southpole_landed', 100, 0),
        makeMockScenario('s2', 'southpole_landed', 100, 14),
      ]

      // s1: 45% of 100h = 45h Sun visible
      const m1 = makeMockMetrics({ pct_sunlit: 45 })
      // s2: 65% of 100h = 65h Sun visible
      const m2 = makeMockMetrics({ pct_sunlit: 65 })

      const caption = formatStep5Caption(scenarios, [m1, m2], false)

      expect(caption).toContain('from 45.0 % to 65.0 %')
      expect(caption).toContain('Sun visible')
      expect(caption).not.toMatch(FORBIDDEN_WORDS)
    })

    it('formatStep3Caption states the hours until sunset from countdown logic', () => {
      const scenario = makeMockScenario('s2', 'artemis_region_1', 720)
      const t0 = Date.parse(scenario.startUtc)
      const sunsetMs = t0 + 18.5 * 3600000 // 18.5 hours
      const events = [{ kind: 'sunset' as const, ms: sunsetMs, utc: '2027-08-30T18:30:00Z' }]

      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11'), scenario],
        bundles: [
          makeMockBundle('apollo_11', 'Apollo 11'),
          makeMockBundle('artemis_region_1', 'Artemis region 1'),
        ],
        metrics: [null, null],
        events: [[], events],
        isSynthetic: false,
      }

      const caption = formatStep3Caption(ctx)

      // Cursor sits 2 h before the sunset, so the caption counts from the cursor, like the card.
      expect(caption).toContain('Sun sets in 2.0 h')
      expect(caption).toContain('Artemis region 1')
      expect(caption).not.toMatch(FORBIDDEN_WORDS)
    })

    it('formatStep1Caption names both sites from the scenario data', () => {
      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11'), makeMockScenario('s2', 'artemis_region_1')],
        bundles: [
          makeMockBundle('apollo_11', 'Apollo 11 (Sea of Tranquillity)'),
          makeMockBundle('artemis_region_1', 'Artemis candidate region 1'),
        ],
        metrics: [null, null],
        events: [[], []],
        isSynthetic: false,
      }

      const caption = formatStep1Caption(ctx)
      expect(caption).toContain('Apollo 11 (Sea of Tranquillity)')
      expect(caption).toContain('Artemis candidate region 1')
      expect(caption).not.toMatch(FORBIDDEN_WORDS)
    })

    it('formatStep2Caption is "Sun and Earth over the local horizon"', () => {
      const ctx: DemoStepContext = {
        scenarios: [],
        bundles: [],
        metrics: [],
        events: [],
        isSynthetic: false,
      }
      expect(formatStep2Caption(ctx)).toBe('Sun and Earth over the local horizon')
    })

    it('formatStep6Caption provides clean conclusion text', () => {
      const ctx: DemoStepContext = {
        scenarios: [],
        bundles: [],
        metrics: [],
        events: [],
        isSynthetic: false,
      }
      expect(formatStep6Caption(ctx)).toContain('Demo complete')
    })

    it('appendDemoDataNotice appends (demo data) when synthetic is true', () => {
      expect(appendDemoDataNotice('Sun visible', true)).toBe('Sun visible (demo data)')
      expect(appendDemoDataNotice('Sun visible', false)).toBe('Sun visible')
      expect(appendDemoDataNotice('Already tagged (demo data)', true)).toBe('Already tagged (demo data)')
    })

    it('findFirstSunsetH calculates exact cursor hour offset within window only', () => {
      const scenario = makeMockScenario('s2', 'artemis_region_1', 720)
      const t0 = Date.parse(scenario.startUtc)
      const events = [
        // Past sunset before window start (should be ignored)
        { kind: 'sunset' as const, ms: t0 - 24 * 3600000, utc: '2027-08-29T00:00:00Z' },
        { kind: 'sunrise' as const, ms: t0 + 10 * 3600000, utc: '2027-08-30T10:00:00Z' },
        { kind: 'sunset' as const, ms: t0 + 24 * 3600000, utc: '2027-08-31T00:00:00Z' },
      ]
      expect(findFirstSunsetH(scenario, events)).toBe(24)
      expect(findFirstSunsetH(scenario, [])).toBeNull()
    })

    it('findSunsetCursorH puts the cursor 2 h before the sunset and never before window start', () => {
      const scenario = makeMockScenario('s2', 'artemis_region_1', 720)
      const t0 = Date.parse(scenario.startUtc)
      const at = (h: number) => [{ kind: 'sunset' as const, ms: t0 + h * 3600000, utc: '' }]
      expect(SUNSET_LEAD_H).toBe(2)
      expect(findSunsetCursorH(scenario, at(184))).toBe(182)
      expect(findSunsetCursorH(scenario, at(1))).toBe(0)
      expect(findSunsetCursorH(scenario, [])).toBeNull()
    })

    it('step 3 sets the cursor 2 h before the sunset on the second card and asks for the loupe', () => {
      const scenario = makeMockScenario('s2', 'artemis_region_1', 720)
      const t0 = Date.parse(scenario.startUtc)
      const events = [{ kind: 'sunset' as const, ms: t0 + 184 * 3600000, utc: '' }]
      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11'), scenario],
        bundles: [null, null],
        metrics: [null, null],
        events: [[], events],
      }
      const step = DEMO_STEPS[2]
      const store = { setPlaying: vi.fn(), setActiveScenario: vi.fn(), setCursorH: vi.fn() }
      step.run(store as unknown as AppStore, ctx)
      expect(step.showLoupe).toBe(true)
      expect(store.setActiveScenario).toHaveBeenCalledWith('s2')
      expect(store.setCursorH).toHaveBeenCalledWith(182)
      expect(step.caption(ctx)).toContain('Sun sets in 2.0 h')
      expect(DEMO_STEPS.filter((x) => x.showLoupe).length).toBe(1)
    })

    it('formatStep3Caption says "Sun sets in less than a minute" below 1 minute', () => {
      const scenario = makeMockScenario('s2', 'artemis_region_1', 720)
      const t0 = Date.parse(scenario.startUtc)
      // 30 seconds into window (0.5 minute)
      const sunsetMs = t0 + 30 * 1000
      const events = [{ kind: 'sunset' as const, ms: sunsetMs, utc: '2027-08-30T00:00:30Z' }]
      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11'), scenario],
        bundles: [
          makeMockBundle('apollo_11', 'Apollo 11'),
          makeMockBundle('artemis_region_1', 'Artemis region 1'),
        ],
        metrics: [null, null],
        events: [[], events],
        isSynthetic: false,
      }
      const caption = formatStep3Caption(ctx)
      expect(caption).toContain('Sun sets in less than a minute.')
    })

    it('formatStep3Caption handles no sunset in window gracefully without claiming one', () => {
      const scenario = makeMockScenario('s2', 'artemis_region_1', 720)
      const ctx: DemoStepContext = {
        scenarios: [makeMockScenario('s1', 'apollo_11'), scenario],
        bundles: [
          makeMockBundle('apollo_11', 'Apollo 11'),
          makeMockBundle('artemis_region_1', 'Artemis region 1'),
        ],
        metrics: [null, null],
        events: [[], []],
        isSynthetic: false,
      }
      const caption = formatStep3Caption(ctx)
      expect(caption).toContain('No sunset data for this window.')
      expect(caption).not.toContain('18 h')
    })

    it('formatStep4Caption and formatStep5Caption show unavailable message when metrics are null', () => {
      const scenarios = [
        makeMockScenario('s1', 'apollo_11'),
        makeMockScenario('s2', 'artemis_region_1'),
      ]
      expect(formatStep4Caption(scenarios, [null, null])).toBe(
        'Metrics unavailable for selected date range.',
      )
      expect(formatStep5Caption(scenarios, [null, null])).toBe(
        'Metrics unavailable for selected date range.',
      )
    })

    it('formatHoursWithUnit formats integers and decimals cleanly', () => {
      expect(formatHoursWithUnit(24)).toBe('24 h')
      expect(formatHoursWithUnit(24.5)).toBe('24.5 h')
      expect(formatHoursWithUnit(-0)).toBe('0 h')
    })

    it('formatPercent uses one decimal and a space before the sign', () => {
      expect(formatPercent(6.8)).toBe('6.8 %')
      expect(formatPercent(94)).toBe('94.0 %')
    })
  })
})
