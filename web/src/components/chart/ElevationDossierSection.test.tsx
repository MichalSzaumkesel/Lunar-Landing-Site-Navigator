// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElevationDossierSection } from './ElevationDossierSection'
import type { EphemFile, HorizonFile, Site, SiteBundle } from '../../lib/types'
import type { Scenario } from '../../state/types'
import { useAppStore } from '../../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeTestBundle(): SiteBundle {
  const site: Site = {
    id: 'shackleton',
    name: 'Shackleton Rim',
    category: 'artemis_region',
    mission: 'Artemis candidate region',
    agency: 'NASA',
    country: 'US',
    lat_deg: -89.9,
    lon_deg: 0.0,
    elevation_m: 1000,
    landing_date_utc: '2026-12-01T00:00:00Z',
    status: 'candidate_region',
    region_radius_km: 15,
    source: { title: 'LRO LOLA', url: 'https://example.com' },
    notes: 'South pole ridge',
  }

  const ephem: EphemFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'shackleton',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 240, // 10 days
    sun: {
      az: Array.from({ length: 240 }, (_, i) => (i * 1.5) % 360),
      el: Array.from({ length: 240 }, (_, i) => 2 + Math.sin((i / 24) * Math.PI * 2) * 4),
    },
    earth: {
      az: Array.from({ length: 240 }, () => 180),
      el: Array.from({ length: 240 }, () => 10),
    },
    sun_ang_radius_deg: 0.26,
    earth_ang_radius_deg: 0.95,
  }

  const horizon: HorizonFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'shackleton',
    az_step_deg: 1,
    n: 360,
    observer_heights_m: [2, 10],
    masks: {
      '2': Array.from({ length: 360 }, () => 1.5),
      '10': Array.from({ length: 360 }, () => 1.0),
    },
  }

  return {
    site,
    ephem,
    horizon,
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }
}

describe('ElevationDossierSection component', () => {
  let container: HTMLDivElement
  let root: Root

  const scenario: Scenario = {
    id: 'sc1',
    siteId: 'shackleton',
    startUtc: '2026-12-01T00:00:00Z',
    durationH: 72,
    slipDays: 0,
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      useAppStore.setState({ cursorH: 12, playing: false })
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders the title and controls', () => {
    const bundle = makeTestBundle()
    act(() => {
      root.render(
        createElement(ElevationDossierSection, {
          scenario,
          bundle,
          heightM: 2,
        }),
      )
    })

    const title = container.querySelector('.elevation-section__title')
    expect(title?.textContent).toBe(
      'Sun and Earth elevation above the horizon over time',
    )

    const buttons = Array.from(container.querySelectorAll('button')).map((b) =>
      b.textContent?.trim(),
    )
    expect(buttons).toContain('24 h')
    expect(buttons).toContain('7 d')
    expect(buttons).toContain('Window')
    expect(buttons).toContain('Table')
  })

  it('toggles between chart view and table view', () => {
    const bundle = makeTestBundle()
    act(() => {
      root.render(
        createElement(ElevationDossierSection, {
          scenario,
          bundle,
          heightM: 2,
        }),
      )
    })

    // Initially chart is visible
    expect(container.querySelector('svg.elevation-chart-svg')).toBeTruthy()
    expect(container.querySelector('table.elevation-table')).toBeNull()

    // Find and click "Table" toggle button
    const tableBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Table',
    )
    expect(tableBtn).toBeTruthy()

    act(() => {
      tableBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Now table is visible
    expect(container.querySelector('svg.elevation-chart-svg')).toBeNull()
    expect(container.querySelector('table.elevation-table')).toBeTruthy()
    expect(tableBtn?.textContent?.trim()).toBe('Chart')

    // Click again to switch back
    act(() => {
      tableBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('svg.elevation-chart-svg')).toBeTruthy()
  })

  it('switches range modes (24 h, 7 d, Window)', () => {
    const bundle = makeTestBundle()
    act(() => {
      root.render(
        createElement(ElevationDossierSection, {
          scenario,
          bundle,
          heightM: 2,
        }),
      )
    })

    const btn24h = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '24 h',
    )
    const btnWindow = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Window',
    )

    expect(btnWindow?.getAttribute('aria-pressed')).toBe('true')
    expect(btn24h?.getAttribute('aria-pressed')).toBe('false')

    act(() => {
      btn24h?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(btn24h?.getAttribute('aria-pressed')).toBe('true')
    expect(btnWindow?.getAttribute('aria-pressed')).toBe('false')
  })

  it('shows loading state when bundle is null', () => {
    act(() => {
      root.render(
        createElement(ElevationDossierSection, {
          scenario,
          bundle: null,
          heightM: 2,
        }),
      )
    })

    const loading = container.querySelector('.elevation-section--loading')
    expect(loading).toBeTruthy()
    expect(loading?.getAttribute('aria-busy')).toBe('true')
  })

  it('shows empty state when outside coverage range', () => {
    const bundle = makeTestBundle()
    const outScenario: Scenario = {
      ...scenario,
      startUtc: '2025-01-01T00:00:00Z', // outside ephem coverage
    }

    act(() => {
      root.render(
        createElement(ElevationDossierSection, {
          scenario: outScenario,
          bundle,
          heightM: 2,
        }),
      )
    })

    const empty = container.querySelector('.elevation-section--empty')
    expect(empty).toBeTruthy()
    expect(empty?.textContent).toContain('unavailable')
  })

  it('strictly adheres to wording rules for readout labels', () => {
    const bundle = makeTestBundle()
    act(() => {
      root.render(
        createElement(ElevationDossierSection, {
          scenario,
          bundle,
          heightM: 2,
        }),
      )
    })

    const readouts = container.querySelector('.elevation-section__readouts')
    const text = readouts?.textContent ?? ''
    expect(text).toContain('Sun:')
    expect(text).toContain('Earth:')
    expect(text).toContain('Horizon (0°)')
    expect(text).toMatch(/Sun (visible|below horizon)/)
    expect(text).toMatch(/Earth (in view|below horizon)/)

    const forbidden = ['power', 'energy', 'signal', 'link', 'best site']
    for (const word of forbidden) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })
})
