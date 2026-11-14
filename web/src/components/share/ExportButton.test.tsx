// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import { ExportButton } from './ExportButton'
import type { SiteBundle, SiteDataSource } from '../../lib/types'
import * as exportCsvModule from '../../lib/exportCsv'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ExportButton', () => {
  let container: HTMLDivElement
  let root: Root

  const mockBundle: SiteBundle = {
    site: {
      id: 'apollo_11',
      name: 'Apollo 11',
      category: 'apollo',
      mission: 'Apollo 11',
      agency: 'NASA',
      country: 'USA',
      lat_deg: 0.674,
      lon_deg: 23.473,
      elevation_m: null,
      landing_date_utc: '1969-07-20T20:17:40Z',
      status: 'landed',
      region_radius_km: null,
      source: { title: 'NASA', url: '' },
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
      site_id: 'apollo_11',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2],
      masks: { '2': new Array(360).fill(0) },
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
      site_id: 'apollo_11',
      start_utc: '2026-11-14T00:00:00Z',
      step_minutes: 60,
      count: 24,
      sun: { az: new Array(24).fill(0), el: new Array(24).fill(10) },
      earth: { az: new Array(24).fill(180), el: new Array(24).fill(45) },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }

  const mockDataSource: SiteDataSource = {
    loadSites: vi.fn(),
    loadSite: vi.fn().mockResolvedValue(mockBundle),
    loadCustomSite: vi.fn(),
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      useAppStore.setState({
        observerHeightM: 2,
        cursorH: 0,
        scenarios: [
          {
            id: 'sc1',
            siteId: 'apollo_11',
            startUtc: '2026-11-14T00:00:00Z',
            durationH: 24,
            slipDays: 0,
          },
        ],
      })
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders "Export CSV" button with tooltip', async () => {
    await act(async () => {
      root.render(createElement(ExportButton, { dataSource: mockDataSource }))
    })

    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Export CSV')
    expect(button?.title).toBe('Export scenarios and metrics as RFC 4180 CSV')
  })

  it('loads site data, builds CSV, and triggers download on click', async () => {
    const downloadSpy = vi
      .spyOn(exportCsvModule, 'downloadText')
      .mockImplementation(() => {})

    await act(async () => {
      root.render(createElement(ExportButton, { dataSource: mockDataSource }))
    })

    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })

    expect(mockDataSource.loadSite).toHaveBeenCalledWith('apollo_11')
    expect(downloadSpy).toHaveBeenCalled()

    const [filename, content] = downloadSpy.mock.calls[0]
    expect(filename).toMatch(/^lunar-scenarios-\d{8}\.csv$/)
    expect(content).toContain('site_name,site_id')
    expect(content).toContain('Apollo 11,apollo_11')
  })

  it('displays error text on failure', async () => {
    const failingDataSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn().mockRejectedValue(new Error('Network error')),
      loadCustomSite: vi.fn(),
    }

    await act(async () => {
      root.render(createElement(ExportButton, { dataSource: failingDataSource }))
    })

    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })

    const error = container.querySelector('[role="alert"]')
    expect(error?.textContent).toContain('Could not export CSV: Network error')
  })
})
