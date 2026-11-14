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

  it('shows the current place on a button that opens a searchable, keyboard-operable list', async () => {
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

    // Closed: one trigger with name and description, no list
    const trigger = container.querySelector<HTMLButtonElement>('.place-trigger')!
    expect(trigger.textContent).toContain('South Pole Site')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('[role="option"]')).toBeNull()

    await act(async () => {
      trigger.click()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    const search = container.querySelector<HTMLInputElement>('.place-search')!
    expect(document.activeElement).toBe(search)

    const rows = () => Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'))
    expect(rows()).toHaveLength(3)
    // Leading "[MOCK] " is stripped; each row has one sentence built from the data
    expect(rows()[0].querySelector('.place-option__name')?.textContent).toBe('Apollo 11')
    expect(rows()[0].querySelector('.place-option__desc')?.textContent).toBe('Apollo landing site (US), near the equator.')
    expect(rows()[1].getAttribute('aria-selected')).toBe('true')
    expect(rows()[1].querySelector('.place-option__check')).not.toBeNull()
    expect(rows()[0].querySelector('.place-option__check')).toBeNull()
    const tabs = Array.from(container.querySelectorAll('.place-tab')).map((t) => t.textContent)
    expect(tabs).toEqual(['All', 'Apollo landings', 'Other landers', 'Possible future landing zones'])
    expect(container.textContent).not.toContain('CLPS')

    // Arrow keys move the highlight, not the place
    expect(search.getAttribute('aria-activedescendant')).toBe(rows()[1].id)
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(search.getAttribute('aria-activedescendant')).toBe(rows()[2].id)
    expect(updateSpy).not.toHaveBeenCalled()

    // Enter selects the highlighted row and closes
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(updateSpy).toHaveBeenCalledWith('sc1', { siteId: 'artemis_region_1' })
    expect(document.activeElement).toBe(trigger)

    // Group chips filter, click selects
    await act(async () => {
      trigger.click()
    })
    const chip = Array.from(container.querySelectorAll<HTMLButtonElement>('.place-tab')).find((t) => t.textContent === 'Apollo landings')!
    await act(async () => {
      chip.click()
    })
    expect(rows()).toHaveLength(1)
    await act(async () => {
      rows()[0].click()
    })
    expect(updateSpy).toHaveBeenCalledWith('sc1', { siteId: 'apollo_11' })
  })

  it('searches by name and description, closes on Escape and on an outside press', async () => {
    vi.spyOn(dataSource, 'loadSites').mockResolvedValue({
      meta: { contract_version: '1.1.1', generated_utc: '2026-01-01T00:00:00Z', generator: 'test', synthetic: false, approximate: false, inputs: [] },
      sites: [
        { id: 'a', name: 'Alpha', category: 'apollo', mission: null, agency: null, country: 'US', lat_deg: 0, lon_deg: 0, elevation_m: 0, landing_date_utc: null, status: 'landed', region_radius_km: null, source: { title: 't', url: 'https://example.com' }, notes: '' },
        { id: 'b', name: 'Beta', category: 'artemis_region', mission: null, agency: null, country: null, lat_deg: -89, lon_deg: 0, elevation_m: 0, landing_date_utc: null, status: 'candidate_region', region_radius_km: null, source: { title: 't', url: 'https://example.com' }, notes: '' },
      ],
    })
    await act(async () => {
      root.render(createElement(PlacePicker, { activeSiteId: 'a' }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const trigger = container.querySelector<HTMLButtonElement>('.place-trigger')!
    await act(async () => {
      trigger.click()
    })
    const search = container.querySelector<HTMLInputElement>('.place-search')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(search, 'south pole')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(Array.from(container.querySelectorAll('.place-option__name')).map((n) => n.textContent)).toEqual(['Beta'])
    await act(async () => {
      setValue.call(search, 'zzz')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toContain('No places match')

    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)

    await act(async () => {
      trigger.click()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
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
