// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportCardPngButton } from './ExportCardPngButton'
import * as exportPngModule from '../../lib/exportPng'
import type { Scenario } from '../../state/types'
import type { ScenarioMetrics, SiteBundle } from '../../lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ExportCardPngButton', () => {
  let container: HTMLDivElement
  let root: Root

  const scenario: Scenario = {
    id: 'sc1',
    siteId: 'apollo_11',
    startUtc: '2026-12-01T00:00:00Z',
    durationH: 336,
    slipDays: 0,
  }

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
      start_utc: '2026-12-01T00:00:00Z',
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

  const mockMetrics: ScenarioMetrics = {
    sun_el_deg: 5.0,
    sun_clearance_deg: 3.0,
    pct_sunlit: 80.0,
    mean_sun_frac: 78.0,
    longest_dark_h: 12,
    pct_earth: 90.0,
    longest_no_earth_h: 0,
    pct_both: 75.0,
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
    vi.restoreAllMocks()
  })

  it('renders "Save card as PNG" button with accessible attributes', async () => {
    await act(async () => {
      root.render(
        createElement(ExportCardPngButton, {
          scenario,
          siteName: 'Apollo 11',
          bundle: mockBundle,
          metrics: mockMetrics,
        }),
      )
    })

    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Save card as PNG')
    expect(button?.getAttribute('aria-label')).toBe('Save card as PNG for Apollo 11')
  })

  it('triggers exportCardAsPng on click', async () => {
    const exportSpy = vi
      .spyOn(exportPngModule, 'exportCardAsPng')
      .mockResolvedValue('apollo_11_2026-12-01.png')

    await act(async () => {
      root.render(
        createElement(ExportCardPngButton, {
          scenario,
          siteName: 'Apollo 11',
          bundle: mockBundle,
          metrics: mockMetrics,
        }),
      )
    })

    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })

    expect(exportSpy).toHaveBeenCalledTimes(1)
    const exportData = exportSpy.mock.calls[0][0]
    expect(exportData.siteName).toBe('Apollo 11')
    expect(exportData.siteId).toBe('apollo_11')
    expect(exportData.metrics).toBe(mockMetrics)
  })

  it('displays a visible alert message if export fails', async () => {
    vi.spyOn(exportPngModule, 'exportCardAsPng').mockRejectedValue(
      new Error('Canvas draw error'),
    )

    await act(async () => {
      root.render(
        createElement(ExportCardPngButton, {
          scenario,
          siteName: 'Apollo 11',
          bundle: mockBundle,
          metrics: mockMetrics,
        }),
      )
    })

    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Could not save PNG: Canvas draw error')
  })

  it('disables button with informative title when not on polar view tab', async () => {
    // Mount simulated tabs in DOM
    const polarTab = document.createElement('button')
    polarTab.id = ':r0:-tab-polar'
    polarTab.setAttribute('role', 'tab')
    polarTab.setAttribute('aria-selected', 'false')
    document.body.appendChild(polarTab)

    const tab3d = document.createElement('button')
    tab3d.id = ':r0:-tab-3d'
    tab3d.setAttribute('role', 'tab')
    tab3d.setAttribute('aria-selected', 'true')
    document.body.appendChild(tab3d)

    await act(async () => {
      root.render(
        createElement(ExportCardPngButton, {
          scenario,
          siteName: 'Apollo 11',
          bundle: mockBundle,
          metrics: mockMetrics,
        }),
      )
    })

    const button = container.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('Switch to the Polar view to save the card')

    polarTab.remove()
    tab3d.remove()
  })

  it('sets aria-busy while exporting', async () => {
    let resolveExport!: () => void
    const exportPromise = new Promise<string>((res) => {
      resolveExport = () => res('apollo_11_2026-12-01.png')
    })
    vi.spyOn(exportPngModule, 'exportCardAsPng').mockReturnValue(exportPromise)

    await act(async () => {
      root.render(
        createElement(ExportCardPngButton, {
          scenario,
          siteName: 'Apollo 11',
          bundle: mockBundle,
          metrics: mockMetrics,
        }),
      )
    })

    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-busy')).toBe('false')

    await act(async () => {
      button.click()
    })

    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.disabled).toBe(true)

    await act(async () => {
      resolveExport()
    })

    expect(button.getAttribute('aria-busy')).toBe('false')
  })
})
