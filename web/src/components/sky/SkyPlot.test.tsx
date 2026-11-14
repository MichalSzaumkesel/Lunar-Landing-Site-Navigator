// @vitest-environment jsdom
// Demo hook #2: the Sun disc is clipped at the horizon and the state flips as the cursor moves.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiteBundle } from '../../lib/types'
import { useAppStore } from '../../state/store'

const meta = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: false,
  approximate: false,
  inputs: [],
}

// Flat 0 deg horizon; Sun elevation by hour: -3, -0.5, 0.5, 4 (angular radius 0.27 deg).
const bundle: SiteBundle = {
  site: {
    id: 'polar',
    name: 'Polar test site',
    category: 'apollo',
    mission: null,
    agency: null,
    country: null,
    lat_deg: -89.5,
    lon_deg: 0,
    elevation_m: null,
    landing_date_utc: null,
    status: 'landed',
    region_radius_km: null,
    source: { title: 'test', url: 'https://example.com' },
    notes: '',
  },
  horizon: { meta, site_id: 'polar', az_step_deg: 360, n: 1, observer_heights_m: [2], masks: { '2': [0] } },
  ephem: {
    meta,
    site_id: 'polar',
    start_utc: '2027-01-01T00:00:00Z',
    step_minutes: 60,
    count: 4,
    sun: { az: [10, 10, 10, 10], el: [-3, -0.5, 0.5, 4] },
    earth: { az: [200, 200, 200, 200], el: [3, 3, 3, 3] },
    sun_ang_radius_deg: 0.27,
    earth_ang_radius_deg: 0.95,
  },
  terrain: null,
  provenance: 'real',
  synthetic: false,
  approximate: false,
}

vi.mock('../../lib/useSiteBundle', () => ({
  useSiteBundle: () => ({ status: 'ready', bundle, error: null }),
}))

import { SkyPlot } from './SkyPlot'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('SkyPlot Sun disc at the horizon', () => {
  let container: HTMLDivElement
  let root: Root

  const at = (cursorH: number) => {
    act(() => useAppStore.setState({ cursorH }))
    return container.querySelector('svg.sky__svg') as SVGSVGElement
  }

  beforeEach(() => {
    useAppStore.setState({
      observerHeightM: 2,
      cursorH: 0,
      scenarios: [{ id: 'sc1', siteId: 'polar', startUtc: '2027-01-01T00:00:00Z', durationH: 3, slipDays: 0 }],
      activeScenarioId: 'sc1',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(createElement(SkyPlot, { scenarioId: 'sc1' })))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('flips the Sun state across the horizon and keeps the disc inside the clip group', () => {
    // Far below: a rim marker replaces the disc.
    let svg = at(0)
    expect(svg.getAttribute('aria-label')).toContain('Sun below horizon')
    expect(svg.querySelector('.sky__disc--sun')).toBeNull()
    expect(svg.querySelector('.sky__marker--sun')).not.toBeNull()

    // Centre just under the horizon: the rim still shows, the state is still "below".
    svg = at(1)
    expect(svg.getAttribute('aria-label')).toContain('Sun below horizon')
    const clipped = svg.querySelector('.sky__disc--sun')
    expect(clipped).not.toBeNull()
    expect(clipped?.closest('g[clip-path]')).not.toBeNull()

    // Centre just above: visible, the disc is still drawn clipped by the terrain layer on top.
    svg = at(2)
    expect(svg.getAttribute('aria-label')).toContain('Sun visible')
    expect(svg.querySelector('.sky__disc--sun')?.closest('g[clip-path]')).not.toBeNull()
    expect(svg.querySelector('.sky__terrain')).not.toBeNull()

    svg = at(3)
    expect(svg.getAttribute('aria-label')).toContain('Sun visible')
  })

  it('shows the outside-data message when the window has no ephemeris', () => {
    act(() =>
      useAppStore.setState({
        scenarios: [{ id: 'sc1', siteId: 'polar', startUtc: '2030-01-01T00:00:00Z', durationH: 3, slipDays: 0 }],
      }),
    )
    expect(container.textContent).toContain('Outside data range')
  })
})
