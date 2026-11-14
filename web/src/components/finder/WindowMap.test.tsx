// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandingWindow, SiteBundle, SitesFile } from '../../lib/types'
import type { WindowMapRow } from '../../lib/windowMap'
import { useAppStore } from '../../state/store'

// Mocks
const mockLoadSites = vi.fn()
const mockLoadSite = vi.fn()
vi.mock('../../lib/loader', () => ({
  dataSource: {
    loadSites: () => mockLoadSites(),
    loadSite: (id: string) => mockLoadSite(id),
  },
}))

const mockComputeWindowMapAsync = vi.fn()
vi.mock('../../lib/windowMapClient', () => ({
  computeWindowMapAsync: (...args: unknown[]) => mockComputeWindowMapAsync(...args),
}))

const mockFindWindows = vi.fn()
vi.mock('../../lib/finder', () => ({
  findWindows: (...args: unknown[]) => mockFindWindows(...args),
}))

import { WindowMap } from './WindowMap'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Mock ResizeObserver
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver

// Mock Canvas 2D context
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  save: () => {},
  restore: () => {},
  scale: () => {},
  fillRect: () => {},
  strokeRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  createPattern: () => null,
}) as unknown as typeof HTMLCanvasElement.prototype.getContext

function makeMockBundle(id: string, name: string): SiteBundle {
  return {
    site: {
      id,
      name,
      category: 'apollo',
      mission: null,
      agency: null,
      country: null,
      lat_deg: 0,
      lon_deg: 0,
      elevation_m: null,
      landing_date_utc: null,
      status: 'landed',
      region_radius_km: null,
      source: { title: 'source', url: 'https://example.com' },
      notes: '',
    },
    horizon: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      site_id: id,
      az_step_deg: 360,
      n: 1,
      observer_heights_m: [2, 10],
      masks: { '2': [0], '10': [0] },
    },
    ephem: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      site_id: id,
      start_utc: '2027-01-01T00:00:00Z',
      step_minutes: 60,
      count: 24,
      sun: { az: [0], el: [10] },
      earth: { az: [0], el: [20] },
      sun_ang_radius_deg: 0.26,
      earth_ang_radius_deg: 0.95,
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }
}

describe('WindowMap', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      useAppStore.setState({
        observerHeightM: 2,
        scenarios: [
          {
            id: 'sc1',
            siteId: 'site_1',
            startUtc: '2027-03-12T00:00:00Z',
            durationH: 240,
            slipDays: 0,
          },
        ],
        activeScenarioId: 'sc1',
        missionRules: {
          observerHeightM: 2,
          missionDurationH: 240,
          minPctSunlit: 70,
          maxLongestDarkH: 48,
          earthAtLandingRequired: true,
          minPctEarth: 50,
        },
      })
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  it('renders loading progress and then normal grid when data finishes loading', async () => {
    const sitesFile: SitesFile = {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      sites: [
        makeMockBundle('site_1', 'Site One').site,
        makeMockBundle('site_2', 'Site Two').site,
      ],
    }

    mockLoadSites.mockResolvedValue(sitesFile)
    mockLoadSite.mockImplementation(async (id: string) => {
      return makeMockBundle(id, id === 'site_1' ? 'Site One' : 'Site Two')
    })

    const mockRow: WindowMapRow = {
      siteId: 'site_1',
      startMs: Date.parse('2027-01-01T00:00:00Z'),
      stepMs: 86_400_000,
      count: 2,
      pctSunlit: new Float32Array([80, 40]),
      pctEarth: new Float32Array([100, 100]),
      longestDarkH: new Float32Array([0, 10]),
      valid: new Uint8Array([1, 0]),
    }
    mockComputeWindowMapAsync.mockResolvedValue([mockRow])
    mockFindWindows.mockReturnValue([
      { start_utc: '2027-01-01T00:00:00Z', end_utc: '2027-01-02T00:00:00Z' } as LandingWindow,
    ])

    await act(async () => {
      root.render(createElement(WindowMap))
    })

    // Advance timers for debounced windowMap computation
    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    // Site labels should be rendered in the HTML column
    const labelCol = container.querySelector('.finder__labels-col')
    expect(labelCol).not.toBeNull()
    expect(labelCol?.textContent).toContain('Site One')
    expect(labelCol?.textContent).toContain('Site Two')

    // Legend should be present
    const legend = container.querySelector('.finder__legend')
    expect(legend?.textContent).toContain('Valid')
    expect(legend?.textContent).toContain('Not valid')
    expect(legend?.textContent).toContain('No data')

    // Canvas should exist
    const canvas = container.querySelector('canvas')
    expect(canvas).not.toBeNull()

    // Valid landing windows list should exist
    const windowsSection = container.querySelector('.finder__windows-section')
    expect(windowsSection?.textContent).toContain('1 Jan 2027 to 2 Jan 2027 (landing times)')

    // Clicking a cell should open a scenario and show confirmation line
    canvas!.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 760,
      height: 56,
      right: 760,
      bottom: 56,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    await act(async () => {
      canvas!.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
        })
      )
    })

    const statusEl = container.querySelector('.finder__confirmation')
    expect(statusEl?.textContent).toBe('Opened Site One from 2027-01-01')

    // Scenario added to store
    expect(useAppStore.getState().scenarios.length).toBe(2)
    expect(useAppStore.getState().scenarios[1].siteId).toBe('site_1')
    expect(useAppStore.getState().scenarios[1].startUtc).toBe('2027-01-01T00:00:00Z')
  })

  it('renders skipped site message when a site fails to load', async () => {
    const sitesFile: SitesFile = {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      sites: [
        makeMockBundle('site_1', 'Site One').site,
        makeMockBundle('site_fail', 'Failing Site').site,
      ],
    }

    mockLoadSites.mockResolvedValue(sitesFile)
    mockLoadSite.mockImplementation(async (id: string) => {
      if (id === 'site_fail') throw new Error('Network error')
      return makeMockBundle(id, 'Site One')
    })
    mockComputeWindowMapAsync.mockResolvedValue([])
    mockFindWindows.mockReturnValue([])

    await act(async () => {
      root.render(createElement(WindowMap))
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const failedList = container.querySelector('.finder__failed-list')
    expect(failedList?.textContent).toContain('Not available: Failing Site')
  })

  it('renders error state with Try again button when loadSites fails', async () => {
    mockLoadSites.mockRejectedValue(new Error('Failed to fetch manifest'))

    await act(async () => {
      root.render(createElement(WindowMap))
    })

    const errorMsg = container.querySelector('.finder__error-msg')
    expect(errorMsg?.textContent).toContain('Could not load site data. Failed to fetch manifest')

    const retryBtn = container.querySelector('.finder__retry-btn') as HTMLButtonElement
    expect(retryBtn).not.toBeNull()
  })

  it('navigates with keyboard and activates cell on Enter', async () => {
    const sitesFile: SitesFile = {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      sites: [
        makeMockBundle('site_1', 'Site One').site,
        makeMockBundle('site_2', 'Site Two').site,
      ],
    }

    mockLoadSites.mockResolvedValue(sitesFile)
    mockLoadSite.mockImplementation(async (id: string) => {
      return makeMockBundle(id, id === 'site_1' ? 'Site One' : 'Site Two')
    })

    const mockRow: WindowMapRow = {
      siteId: 'site_1',
      startMs: Date.parse('2027-01-01T00:00:00Z'),
      stepMs: 86_400_000,
      count: 2,
      pctSunlit: new Float32Array([80, 40]),
      pctEarth: new Float32Array([100, 100]),
      longestDarkH: new Float32Array([0, 10]),
      valid: new Uint8Array([1, 0]),
    }
    mockComputeWindowMapAsync.mockResolvedValue([mockRow, { ...mockRow, siteId: 'site_2' }])
    mockFindWindows.mockReturnValue([])

    await act(async () => {
      root.render(createElement(WindowMap))
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const wrapper = container.querySelector('.finder__canvas-wrapper') as HTMLDivElement
    expect(wrapper).not.toBeNull()

    // Move to next day (ArrowRight)
    await act(async () => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    const liveRegion = container.querySelector('.sr-only[aria-live="polite"]')
    expect(liveRegion?.textContent).toContain('Site One')

    // Activate with Enter
    await act(async () => {
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    const statusEl = container.querySelector('.finder__confirmation')
    expect(statusEl?.textContent).toBe('Opened Site One from 2027-01-02')
  })

  it('renders empty state when no curated sites exist', async () => {
    mockLoadSites.mockResolvedValue({
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      sites: [],
    })

    await act(async () => {
      root.render(createElement(WindowMap))
    })

    expect(container.querySelector('.finder__empty')?.textContent).toContain('No sites available.')
  })
})
