// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlacePicker } from './PlacePicker'
import { dataSource } from '../../lib/loader'
import { useAppStore } from '../../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PlacePicker component', () => {
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
    vi.restoreAllMocks()
  })

  it('renders quick buttons and a grouped list of all sites from dataSource', async () => {
    const mockSites = [
      {
        id: 'apollo_11',
        name: '[MOCK] Apollo 11',
        category: 'apollo' as const,
        mission: 'Apollo 11',
        agency: 'NASA',
        country: 'US',
        lat_deg: 0.67,
        lon_deg: 23.47,
        elevation_m: -1500,
        landing_date_utc: '1969-07-20T20:17:40Z',
        status: 'landed' as const,
        region_radius_km: null,
        source: { title: 'NASA', url: 'https://example.com' },
        notes: '',
      },
      {
        id: 'southpole_landed',
        name: '[MOCK] South Pole Site',
        category: 'clps' as const,
        mission: null,
        agency: null,
        country: null,
        lat_deg: -89.9,
        lon_deg: 0,
        elevation_m: 0,
        landing_date_utc: null,
        status: 'landed' as const,
        region_radius_km: null,
        source: { title: 'NASA', url: 'https://example.com' },
        notes: '',
      },
      {
        id: 'artemis_region_1',
        name: '[MOCK] Connecting Ridge',
        category: 'artemis_region' as const,
        mission: null,
        agency: null,
        country: null,
        lat_deg: -89.5,
        lon_deg: 120,
        elevation_m: 0,
        landing_date_utc: null,
        status: 'candidate_region' as const,
        region_radius_km: null,
        source: { title: 'NASA', url: 'https://example.com' },
        notes: '',
      },
    ]

    vi.spyOn(dataSource, 'loadSites').mockResolvedValue({
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: false,
        approximate: false,
        inputs: [],
      },
      sites: mockSites,
    })

    const updateSpy = vi.fn()
    useAppStore.setState({ activeScenarioId: 'sc1', updateScenario: updateSpy })

    await act(async () => {
      root.render(createElement(PlacePicker, { activeSiteId: 'southpole_landed' }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const buttons = container.querySelectorAll<HTMLButtonElement>('.simple-place-btn')
    expect(buttons).toHaveLength(3)

    // Leading "[MOCK] " should be stripped
    expect(buttons[0].querySelector('.simple-place-btn__title')?.textContent).toBe('Apollo 11')
    expect(buttons[0].querySelector('.simple-place-btn__caption')?.textContent).toBe('Near the equator')
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false')

    expect(buttons[1].querySelector('.simple-place-btn__title')?.textContent).toBe('South Pole Site')
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')

    expect(buttons[2].querySelector('.simple-place-btn__title')?.textContent).toBe('Connecting Ridge')
    expect(buttons[2].querySelector('.simple-place-btn__caption')?.textContent).toBe('Near the south pole')

    // The dropdown lists every site, grouped without acronyms
    const groups = Array.from(container.querySelectorAll('optgroup')).map((g) => g.label)
    expect(groups).toEqual(['Apollo landings', 'Other landers', 'Possible future landing zones'])
    expect(container.querySelectorAll('option')).toHaveLength(3)
    expect(container.textContent).not.toContain('CLPS')

    // Click on first button updates active scenario
    await act(async () => {
      buttons[0].click()
    })

    expect(updateSpy).toHaveBeenCalledWith('sc1', { siteId: 'apollo_11' })
  })

  it('shows plain error with role="alert" and "Try again" button that reloads the site list when load fails', async () => {
    const loadSpy = vi.spyOn(dataSource, 'loadSites').mockRejectedValue(new Error('Network error'))

    await act(async () => {
      root.render(createElement(PlacePicker, { activeSiteId: 'southpole_landed' }))
    })
    await act(async () => {
      await Promise.resolve()
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Could not load the list of places')

    const retryBtn = alert?.querySelector<HTMLButtonElement>('button')
    expect(retryBtn?.textContent).toBe('Try again')

    // Click retry reloads sites
    await act(async () => {
      retryBtn?.click()
    })

    expect(loadSpy).toHaveBeenCalledTimes(2)
  })
})
