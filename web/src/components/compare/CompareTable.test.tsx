// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EphemFile, HorizonFile, SiteBundle, SiteDataSource } from '../../lib/types'
import type { Scenario } from '../../state/types'
import { CompareTable } from './CompareTable'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function createMockHorizon(maxEl = 2.4): HorizonFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'site1',
    az_step_deg: 90,
    n: 4,
    observer_heights_m: [2, 10],
    masks: {
      '2': [0.5, maxEl, 1.2, 0.0],
      '10': [0.2, maxEl * 0.8, 0.8, 0.0],
    },
  }
}

function createMockEphem(sunEl = [1.5, 3.4, 2.2, 1.0]): EphemFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'site1',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 4,
    sun: {
      az: [0, 90, 180, 270],
      el: sunEl,
    },
    earth: {
      az: [0, 0, 0, 0],
      el: [5.0, 5.0, 5.0, 5.0],
    },
    sun_ang_radius_deg: 0.266,
    earth_ang_radius_deg: 0.95,
  }
}

function createBundle(name: string, siteId: string, maxEl = 2.4, sunEl = [1.5, 3.4, 2.2, 1.0]): SiteBundle {
  return {
    site: {
      id: siteId,
      name,
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
    horizon: createMockHorizon(maxEl),
    ephem: createMockEphem(sunEl),
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }
}

describe('CompareTable', () => {
  let container: HTMLDivElement
  let root: Root

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

  it('renders empty state when fewer than 2 scenarios are provided', async () => {
    const singleScenario: Scenario[] = [
      { id: 's1', siteId: 'shackleton', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
    ]

    await act(async () => {
      root.render(createElement(CompareTable, { scenarios: singleScenario }))
    })

    expect(container.textContent).toContain('2 to 4 scenarios required')
    expect(container.textContent).toContain('Add at least 2 scenarios')
  })

  it('renders comparison table with 2 scenarios and displays criteria rows', async () => {
    const bundle1 = createBundle('Shackleton', 'site1', 2.4, [1.5, 3.4, 2.2, 1.0])
    const bundle2 = createBundle('Connecting Ridge', 'site2', 1.0, [2.0, 4.0, 3.0, 2.0])

    const mockDataSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn().mockImplementation((siteId: string) => {
        if (siteId === 'site1') return Promise.resolve(bundle1)
        if (siteId === 'site2') return Promise.resolve(bundle2)
        return Promise.reject(new Error('Unknown site'))
      }),
      loadCustomSite: vi.fn(),
    }

    const scenarios: Scenario[] = [
      { id: 'sc1', siteId: 'site1', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
      { id: 'sc2', siteId: 'site2', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
    ]

    await act(async () => {
      root.render(
        createElement(CompareTable, {
          scenarios,
          observerHeightM: 2,
          cursorH: 0,
          dataSource: mockDataSource,
        }),
      )
    })

    // Allow promise resolution
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Shackleton')
    expect(container.textContent).toContain('Connecting Ridge')
    expect(container.textContent).toContain('Sun visible (% of window)')
    expect(container.textContent).toContain('Longest continuous Sun gap')
    expect(container.textContent).toContain('Highest terrain horizon elevation')
    expect(container.textContent).toContain('Minimum Sun clearance')
  })

  it('highlights better value softly with neutral wording higher/lower', async () => {
    // site1 has highest horizon 2.4 deg, site2 has 1.0 deg (lower is better for horizon elevation)
    const bundle1 = createBundle('Shackleton', 'site1', 2.4)
    const bundle2 = createBundle('Connecting Ridge', 'site2', 1.0)

    const mockDataSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn().mockImplementation((siteId: string) => {
        if (siteId === 'site1') return Promise.resolve(bundle1)
        return Promise.resolve(bundle2)
      }),
      loadCustomSite: vi.fn(),
    }

    const scenarios: Scenario[] = [
      { id: 'sc1', siteId: 'site1', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
      { id: 'sc2', siteId: 'site2', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
    ]

    await act(async () => {
      root.render(
        createElement(CompareTable, {
          scenarios,
          observerHeightM: 2,
          cursorH: 0,
          dataSource: mockDataSource,
        }),
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    const tags = Array.from(container.querySelectorAll('.compare-tag')).map((el) => el.textContent)
    expect(tags).toContain('lower')
  })

  it('reorders columns when clicking a criterion row header', async () => {
    // site1 min clearance: 1.0. site2 min clearance: 2.0.
    const bundle1 = createBundle('Site Alpha', 'site1', 2.4, [1.5, 3.4, 2.2, 1.0])
    const bundle2 = createBundle('Site Beta', 'site2', 1.0, [3.0, 5.0, 4.0, 3.0])

    const mockDataSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn().mockImplementation((siteId: string) => {
        if (siteId === 'site1') return Promise.resolve(bundle1)
        return Promise.resolve(bundle2)
      }),
      loadCustomSite: vi.fn(),
    }

    const scenarios: Scenario[] = [
      { id: 'sc1', siteId: 'site1', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
      { id: 'sc2', siteId: 'site2', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
    ]

    await act(async () => {
      root.render(
        createElement(CompareTable, {
          scenarios,
          observerHeightM: 2,
          cursorH: 0,
          dataSource: mockDataSource,
        }),
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    // Click sort by Minimum Sun clearance (higher is better -> descending order: Site Beta then Site Alpha)
    const clearanceSortBtn = Array.from(container.querySelectorAll('.compare-sort-btn')).find((btn) =>
      btn.textContent?.includes('Minimum Sun clearance'),
    ) as HTMLButtonElement
    expect(clearanceSortBtn).toBeTruthy()

    await act(async () => {
      clearanceSortBtn.click()
    })

    const columnHeaders = Array.from(container.querySelectorAll('th[scope="col"]'))
    expect(columnHeaders[1]?.textContent).toContain('Site Beta')
    expect(columnHeaders[2]?.textContent).toContain('Site Alpha')

    // Reset sort button appears and restores order
    const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reset order'),
    ) as HTMLButtonElement
    expect(resetBtn).toBeTruthy()

    await act(async () => {
      resetBtn.click()
    })

    const restoredHeaders = Array.from(container.querySelectorAll('th[scope="col"]'))
    expect(restoredHeaders[1]?.textContent).toContain('Site Alpha')
    expect(restoredHeaders[2]?.textContent).toContain('Site Beta')
  })

  it('copies CSV when clicking Copy CSV button', async () => {
    const bundle1 = createBundle('Site A', 'site1')
    const bundle2 = createBundle('Site B', 'site2')

    const mockDataSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn().mockImplementation((siteId: string) => {
        if (siteId === 'site1') return Promise.resolve(bundle1)
        return Promise.resolve(bundle2)
      }),
      loadCustomSite: vi.fn(),
    }

    const scenarios: Scenario[] = [
      { id: 'sc1', siteId: 'site1', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
      { id: 'sc2', siteId: 'site2', startUtc: '2026-12-01T00:00:00Z', durationH: 4, slipDays: 0 },
    ]

    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    await act(async () => {
      root.render(
        createElement(CompareTable, {
          scenarios,
          observerHeightM: 2,
          cursorH: 0,
          dataSource: mockDataSource,
        }),
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    const copyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Copy CSV'),
    ) as HTMLButtonElement
    expect(copyBtn).toBeTruthy()

    await act(async () => {
      copyBtn.click()
    })

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const csvArg = writeTextMock.mock.calls[0][0]
    expect(csvArg).toContain('site_name')
    expect(csvArg).toContain('Site A')
    expect(csvArg).toContain('Site B')
  })
})
