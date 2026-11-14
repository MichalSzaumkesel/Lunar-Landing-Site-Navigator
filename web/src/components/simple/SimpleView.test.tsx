// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimpleView } from './SimpleView'
import * as useSiteBundleModule from '../../lib/useSiteBundle'
import * as useScenarioMetricsModule from '../../lib/useScenarioMetrics'
import { dataSource } from '../../lib/loader'
import { useAppStore } from '../../state/store'
import type { SiteBundle } from '../../lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Mock SkyPlot to keep tests lightweight
vi.mock('../sky/SkyPlot', () => ({
  SkyPlot: () => createElement('div', { 'data-testid': 'mock-sky-plot' }),
}))

describe('SimpleView component', () => {
  let container: HTMLDivElement
  let root: Root

  const mockBundle: SiteBundle = {
    site: {
      id: 'southpole_landed',
      name: '[MOCK] South Pole',
      category: 'clps',
      mission: null,
      agency: null,
      country: null,
      lat_deg: -89.9,
      lon_deg: 0,
      elevation_m: 0,
      landing_date_utc: null,
      status: 'landed',
      region_radius_km: null,
      source: { title: 'NASA', url: 'https://example.com' },
      notes: '',
    },
    ephem: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: true,
        inputs: [],
      },
      site_id: 'southpole_landed',
      start_utc: '2026-01-01T00:00:00Z',
      step_minutes: 60,
      count: 24,
      sun: { az: [0], el: [1] },
      earth: { az: [0], el: [1] },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    },
    horizon: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: true,
        inputs: [],
      },
      site_id: 'southpole_landed',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2],
      masks: { '2': [0] },
    },
    terrain: null,
    provenance: 'mock',
    synthetic: true,
    approximate: true,
  }

  beforeEach(() => {
    vi.spyOn(dataSource, 'loadSites').mockResolvedValue({
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: true,
        inputs: [],
      },
      sites: [mockBundle.site],
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    useAppStore.setState({
      scenarios: [
        {
          id: 'sc-1',
          siteId: 'southpole_landed',
          startUtc: '2026-01-01T00:00:00Z',
          durationH: 24,
          slipDays: 0,
        },
      ],
      activeScenarioId: 'sc-1',
      cursorH: 0,
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders out-of-range sentence when metrics are null and date input remains usable', async () => {
    vi.spyOn(useSiteBundleModule, 'useSiteBundle').mockReturnValue({
      status: 'ready',
      bundle: mockBundle,
      error: null,
    })
    vi.spyOn(useScenarioMetricsModule, 'useScenarioMetrics').mockReturnValue(null)

    await act(async () => {
      root.render(createElement(SimpleView))
    })

    const summary = container.querySelector('.simple-summary')
    expect(summary).not.toBeNull()
    expect(summary?.textContent).toContain('This date is outside the data we have.')
    expect(summary?.textContent).toContain('We only have data from')
    expect(summary?.querySelector('.simple-reset')).not.toBeNull()

    // Date input remains present and usable
    const dateInput = container.querySelector<HTMLInputElement>('#simple-start-date')
    expect(dateInput).not.toBeNull()
    expect(dateInput?.value).toBe('2026-01-01')

    // Place picker remains present
    const placePicker = container.querySelector('.simple-places')
    expect(placePicker).not.toBeNull()
  })

  it('renders DataBadges in SimpleView card header for synthetic and approximate data', async () => {
    vi.spyOn(useSiteBundleModule, 'useSiteBundle').mockReturnValue({
      status: 'ready',
      bundle: mockBundle,
      error: null,
    })
    vi.spyOn(useScenarioMetricsModule, 'useScenarioMetrics').mockReturnValue({
      sun_el_deg: 1,
      sun_clearance_deg: 0.5,
      pct_sunlit: 50,
      mean_sun_frac: 0.5,
      longest_dark_h: 2,
      pct_earth: 50,
      longest_no_earth_h: 2,
      pct_both: 25,
      next_sunset_utc: null,
      next_sunrise_utc: null,
      next_earthset_utc: null,
      next_earthrise_utc: null,
      time_to_sunset_h: null,
      time_to_earthset_h: null,
      gaps: {},
    })

    await act(async () => {
      root.render(createElement(SimpleView))
    })

    const badges = container.querySelector('.data-badges')
    expect(badges).not.toBeNull()
    expect(container.querySelector('.badge--synthetic')?.textContent).toBe('Synthetic data')
    expect(container.querySelector('.badge--approximate')?.textContent).toBe('Approximate')

    // Two matching blocks and four window rows replace the old headline and chips
    const blocks = container.querySelectorAll('.simple-block')
    expect(blocks).toHaveLength(2)
    expect(blocks[0].querySelector('.simple-block__headline')?.textContent).toMatch(/^Sun (visible|below horizon)$/)
    expect(blocks[1].querySelector('.simple-block__headline')?.textContent).toMatch(/^Earth (in view|below horizon)$/)
    expect(container.querySelectorAll('.simple-chip')).toHaveLength(0)
    const window = container.querySelector('[aria-label="Over the whole window"]')
    expect(window?.querySelectorAll('.simple-row')).toHaveLength(4)
    expect(window?.querySelectorAll('.simple-row--child')).toHaveLength(2)

    // Extra details: grouped under Sun, Earth and Site, each row with a plain definition
    expect([...container.querySelectorAll('.simple-detail__title')].map((e) => e.textContent)).toEqual(['Sun', 'Earth', 'Site'])
    const detailRows = container.querySelectorAll('.simple-detail .simple-row')
    expect(detailRows.length).toBeGreaterThanOrEqual(5)
    detailRows.forEach((r) => expect(r.getAttribute('title')).toBeTruthy())
    expect(container.textContent).toContain('Highest Sun above the horizon')
    expect(container.textContent).toContain('Highest hill on the horizon')
    expect(container.textContent).not.toMatch(/CLPS|disc/)
  })

  it('renders plain error with role="alert" and Try again button when bundle load fails', async () => {
    vi.spyOn(useSiteBundleModule, 'useSiteBundle').mockReturnValue({
      status: 'error',
      bundle: null,
      error: 'Network failure',
    })

    await act(async () => {
      root.render(createElement(SimpleView))
    })

    const errorAlert = container.querySelector('.simple-error[role="alert"]')
    expect(errorAlert).not.toBeNull()
    expect(errorAlert?.textContent).toContain('Could not load this place. Try another place.')

    const retryBtn = errorAlert?.querySelector<HTMLButtonElement>('button')
    expect(retryBtn).not.toBeNull()
    expect(retryBtn?.textContent).toBe('Try again')
  })
})
