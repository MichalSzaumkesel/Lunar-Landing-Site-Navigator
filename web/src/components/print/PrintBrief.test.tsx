// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MissionRules, ScenarioMetrics, SiteBundle } from '../../lib/types'
import type { Scenario } from '../../state/types'
import { PrintBrief } from './PrintBrief'
import { PRINT_FOOTER_TEXT } from './printHelpers'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PrintBrief component', () => {
  let container: HTMLDivElement
  let root: Root

  const mockBundle1: SiteBundle = {
    site: {
      id: 'shackleton',
      name: 'Shackleton Crater',
      category: 'artemis_region',
      mission: 'Artemis candidate region',
      agency: 'NASA',
      country: 'USA',
      lat_deg: -89.9,
      lon_deg: 0.0,
      elevation_m: null,
      landing_date_utc: '2026-11-14T00:00:00Z',
      status: 'planned',
      region_radius_km: 15,
      source: { title: 'NASA Artemis Sites', url: 'https://example.com' },
      notes: 'South pole site',
    },
    horizon: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'mock_gen',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'shackleton',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2, 10],
      masks: {
        '2': new Array(360).fill(1.5),
        '10': new Array(360).fill(1.0),
      },
    },
    ephem: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'mock_gen',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'shackleton',
      start_utc: '2026-11-14T00:00:00Z',
      step_minutes: 60,
      count: 336,
      sun: {
        az: new Array(336).fill(0).map((_, i) => (i * 0.5) % 360),
        el: new Array(336).fill(0).map((_, i) => 1.5 + Math.sin(i / 10) * 1.5),
      },
      earth: {
        az: new Array(336).fill(180),
        el: new Array(336).fill(6.0),
      },
      sun_ang_radius_deg: 0.26,
      earth_ang_radius_deg: 0.95,
      horizons_query: { COMMAND: '301' },
    },
    terrain: null,
    provenance: 'mock',
    synthetic: true,
    approximate: false,
  }

  const mockBundle2: SiteBundle = {
    site: {
      id: 'malapert_summit',
      name: 'Malapert Summit',
      category: 'artemis_region',
      mission: 'Artemis candidate region',
      agency: 'NASA',
      country: 'USA',
      lat_deg: -85.99,
      lon_deg: 2.93,
      elevation_m: null,
      landing_date_utc: null,
      status: 'planned',
      region_radius_km: 10,
      source: { title: 'NASA', url: '' },
      notes: '',
    },
    horizon: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'lola_gen',
        synthetic: false,
        approximate: true,
        inputs: [],
      },
      site_id: 'malapert_summit',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2, 10],
      masks: {
        '2': new Array(360).fill(2.0),
        '10': new Array(360).fill(1.5),
      },
      dem: { product: 'LOLA_30m', resolution_m: 30, url: '', max_range_km: 100 },
    },
    ephem: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'jpl_horizons',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      site_id: 'malapert_summit',
      start_utc: '2026-11-14T00:00:00Z',
      step_minutes: 60,
      count: 336,
      sun: {
        az: new Array(336).fill(0).map((_, i) => (i * 0.5) % 360),
        el: new Array(336).fill(0).map((_, i) => 2.0 + Math.sin(i / 10) * 1.5),
      },
      earth: {
        az: new Array(336).fill(180),
        el: new Array(336).fill(5.0),
      },
      sun_ang_radius_deg: 0.26,
      earth_ang_radius_deg: 0.95,
      horizons_query: { COMMAND: '301' },
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: true,
  }

  const mockScenario1: Scenario = {
    id: 'sc-1',
    siteId: 'shackleton',
    startUtc: '2026-11-14T00:00:00Z',
    durationH: 336,
    slipDays: 0,
  }

  const mockScenario2: Scenario = {
    id: 'sc-2',
    siteId: 'malapert_summit',
    startUtc: '2026-11-14T00:00:00Z',
    durationH: 336,
    slipDays: 2,
  }

  const mockRules: MissionRules = {
    observerHeightM: 2,
    missionDurationH: 240,
    minPctSunlit: 70,
    maxLongestDarkH: 48,
    earthAtLandingRequired: true,
    minPctEarth: 50,
  }

  const mockMetrics1: ScenarioMetrics = {
    sun_el_deg: 2.1,
    sun_clearance_deg: 0.6,
    pct_sunlit: 85.0,
    mean_sun_frac: 82.5,
    longest_dark_h: 24,
    pct_earth: 90.0,
    longest_no_earth_h: 0,
    pct_both: 80.0,
    next_sunset_utc: null,
    next_sunrise_utc: null,
    next_earthset_utc: null,
    next_earthrise_utc: null,
    time_to_sunset_h: null,
    time_to_earthset_h: null,
    gaps: {},
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders title, UTC printout time, and disclaimer footer', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1],
          bundles: { shackleton: mockBundle1 },
          metricsMap: { 'sc-1': mockMetrics1 },
          missionRules: mockRules,
          printTimeUtc: '2026-11-14 11:53 UTC',
        }),
      )
    })

    const title = container.querySelector('.print-brief__doc-title')
    expect(title?.textContent).toBe('Lunar Surface Mission Brief')

    const meta = container.querySelector('.print-brief__header-meta')
    expect(meta?.textContent).toContain('2026-11-14 11:53 UTC')
    expect(meta?.textContent).toContain('Observer Height: 2 m')

    const footer = container.querySelector('.print-brief__footer-disclaimer')
    expect(footer?.textContent).toBe(PRINT_FOOTER_TEXT)
  })

  it('renders scenario details: site name, coordinates, date range, badges', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1, mockScenario2],
          bundles: {
            shackleton: mockBundle1,
            malapert_summit: mockBundle2,
          },
          missionRules: mockRules,
          printTimeUtc: '2026-11-14 11:53 UTC',
        }),
      )
    })

    // Check titles
    const titles = Array.from(container.querySelectorAll('.print-scenario-title')).map(
      (el) => el.textContent,
    )
    expect(titles).toContain('Shackleton Crater')
    expect(titles).toContain('Malapert Summit')

    // Check coordinates
    expect(container.textContent).toContain('89.90° S, 0.00° E')
    expect(container.textContent).toContain('85.99° S, 2.93° E')

    // Check badges
    expect(container.textContent).toContain('Synthetic data')
    expect(container.textContent).toContain('Approximate')

    // Check date ranges
    expect(container.textContent).toContain('2026-11-14 to 2026-11-28 UTC')
    expect(container.textContent).toContain('slip +2 d')
  })

  it('renders static SVG sky plots for each scenario', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1],
          bundles: { shackleton: mockBundle1 },
          missionRules: mockRules,
        }),
      )
    })

    const svg = container.querySelector('svg.print-sky-plot')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('role')).toBe('img')
    // SVG contains compass directions
    expect(svg?.textContent).toContain('N')
    expect(svg?.textContent).toContain('S')
    expect(svg?.textContent).toContain('E')
    expect(svg?.textContent).toContain('W')
  })

  it('renders the compact metrics table with values matching metrics panel', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1],
          bundles: { shackleton: mockBundle1 },
          metricsMap: { 'sc-1': mockMetrics1 },
          missionRules: mockRules,
        }),
      )
    })

    expect(container.textContent).toContain('Sun visible')
    expect(container.textContent).toContain('85.0 %')
    expect(container.textContent).toContain('Mean visible Sun disc')
    expect(container.textContent).toContain('82.5 %')
    expect(container.textContent).toContain('Longest dark stretch')
    expect(container.textContent).toContain('24 h')
    expect(container.textContent).toContain('Earth in view')
    expect(container.textContent).toContain('90.0 %')
    expect(container.textContent).toContain('Sun and Earth together')
    expect(container.textContent).toContain('80.0 %')
  })

  it('renders mission rules and whether they are met', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1],
          bundles: { shackleton: mockBundle1 },
          metricsMap: { 'sc-1': mockMetrics1 },
          missionRules: mockRules,
        }),
      )
    })

    expect(container.textContent).toContain('Mission Rules Evaluation')
    expect(container.textContent).toContain('All mission rules met')
    expect(container.textContent).toContain('✓ Met')
    expect(container.textContent).toContain('Sun visible')
    expect(container.textContent).toContain('Max dark stretch')
    expect(container.textContent).toContain('Earth in view')
  })

  it('evaluates the rules on the same window as the metrics table', () => {
    const bundle: SiteBundle = {
      ...mockBundle1,
      ephem: {
        ...mockBundle1.ephem!,
        sun: {
          az: new Array(336).fill(0),
          el: new Array(336).fill(0).map((_, i) => (i < 240 ? 10 : -10)),
        },
      },
    }
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1],
          bundles: { shackleton: bundle },
          missionRules: mockRules,
        }),
      )
    })

    // Window is 336 h, rules mission is 240 h: the Sun share must be the whole-window 71.4 % in both tables.
    const actuals = Array.from(container.querySelectorAll('.print-rule-detail__actual')).map((e) => e.textContent)
    expect(actuals).toContain('71.4 %')
  })

  it('renders provenance lines with real or mock indication and source IDs', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1, mockScenario2],
          bundles: {
            shackleton: mockBundle1,
            malapert_summit: mockBundle2,
          },
          missionRules: mockRules,
        }),
      )
    })

    expect(container.textContent).toContain('Mock data')
    expect(container.textContent).toContain('Site ID: shackleton')
    expect(container.textContent).toContain('Site ID: malapert_summit')
  })

  it('renders outside data range when metrics is null', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1],
          bundles: { shackleton: mockBundle1 },
          metricsMap: { 'sc-1': null },
          missionRules: mockRules,
        }),
      )
    })

    expect(container.textContent).toContain('outside data range')
  })

  it('is hidden by default without forceVisible (for media print isolation)', () => {
    act(() => {
      root.render(
        createElement(PrintBrief, {
          scenarios: [mockScenario1],
          bundles: { shackleton: mockBundle1 },
          missionRules: mockRules,
        }),
      )
    })

    const briefContainer = container.querySelector('.print-brief-container')
    expect(briefContainer?.classList.contains('print-brief-container--visible')).toBe(false)
  })

  it('supports up to 4 scenarios side by side', () => {
    const sc3: Scenario = { ...mockScenario1, id: 'sc-3' }
    const sc4: Scenario = { ...mockScenario2, id: 'sc-4' }
    const sc5: Scenario = { ...mockScenario1, id: 'sc-5' }

    act(() => {
      root.render(
        createElement(PrintBrief, {
          forceVisible: true,
          scenarios: [mockScenario1, mockScenario2, sc3, sc4, sc5],
          bundles: {
            shackleton: mockBundle1,
            malapert_summit: mockBundle2,
          },
          missionRules: mockRules,
        }),
      )
    })

    // Slices to max 4 scenarios
    const headers = container.querySelectorAll('.print-col-header')
    expect(headers).toHaveLength(4)
  })
})
