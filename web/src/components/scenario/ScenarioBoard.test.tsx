// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRESET_APOLLO_VS_ARTEMIS } from '../../config/presets'
import type { SiteBundle } from '../../lib/types'
import { useAppStore } from '../../state/store'
import { useDemoStore } from '../demo/demoState'

const meta = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: false,
  approximate: false,
  inputs: [],
}

const NAMES: Record<string, string> = { apollo_11: 'Apollo 11', artemis_region_1: 'Artemis III region' }

function bundleFor(id: string): SiteBundle {
  return {
    site: {
      id,
      name: NAMES[id] ?? id,
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
      source: { title: 'test', url: 'https://example.com' },
      notes: '',
    },
    horizon: { meta, site_id: id, az_step_deg: 360, n: 1, observer_heights_m: [2], masks: { '2': [0] } },
    ephem: {
      meta,
      site_id: id,
      start_utc: '2027-01-01T00:00:00Z',
      step_minutes: 60,
      count: 3,
      sun: { az: [0, 0, 0], el: [5, 6, 7] },
      earth: { az: [90, 90, 90], el: [20, 20, 20] },
      sun_ang_radius_deg: 0.27,
      earth_ang_radius_deg: 0.95,
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }
}

vi.mock('../../lib/useSiteBundle', () => ({
  useSiteBundle: (id: string) => ({ status: 'ready', bundle: bundleFor(id), error: null }),
}))
vi.mock('../../lib/loader', () => ({
  dataSource: {
    loadSites: () => Promise.resolve({ meta, sites: [bundleFor('apollo_11').site, bundleFor('artemis_region_1').site] }),
    loadSite: (id: string) => Promise.resolve(bundleFor(id)),
  },
}))

import { ScenarioBoard } from './ScenarioBoard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver

describe('ScenarioBoard preset (demo hook #1)', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    useAppStore.setState({
      observerHeightM: 2,
      cursorH: 0,
      playing: false,
      scenarios: [{ id: 'sc1', siteId: 'apollo_11', startUtc: '2027-01-01T00:00:00Z', durationH: 3, slipDays: 0 }],
      activeScenarioId: 'sc1',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(ScenarioBoard)))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const cards = () => [...container.querySelectorAll('section.card')]

  it('shows two cards, Apollo 11 and the Artemis region, after the preset is applied', async () => {
    expect(cards()).toHaveLength(1)

    await act(async () => useAppStore.getState().applyPreset(PRESET_APOLLO_VS_ARTEMIS))

    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual([
      'Scenario Apollo 11',
      'Scenario Artemis III region',
    ])
    expect(cards()[0].getAttribute('aria-current')).toBe('true')
    expect(cards()[1].getAttribute('aria-current')).toBeNull()
  })

  it('removing the active card leaves the other one active', async () => {
    await act(async () => useAppStore.getState().applyPreset(PRESET_APOLLO_VS_ARTEMIS))

    const remove = container.querySelector('button[aria-label="Remove scenario Apollo 11"]') as HTMLButtonElement
    await act(async () => remove.click())
    // The removed card stays for its exit animation.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })

    expect(cards().map((c) => c.getAttribute('aria-label'))).toEqual(['Scenario Artemis III region'])
    expect(cards()[0].getAttribute('aria-current')).toBe('true')
  })

  it('two cards keep the loupe closed; a demo step opens it on the active card only and restores after', async () => {
    await act(async () => useAppStore.getState().applyPreset(PRESET_APOLLO_VS_ARTEMIS))
    const toggles = () => [...container.querySelectorAll('.views__loupe-toggle')]
    expect(toggles().map((t) => t.getAttribute('aria-expanded'))).toEqual(['false', 'false'])

    await act(async () => useDemoStore.setState({ loupeOpen: true }))
    expect(toggles().map((t) => t.getAttribute('aria-expanded'))).toEqual(['true', 'false'])

    await act(async () => useAppStore.getState().setActiveScenario(useAppStore.getState().scenarios[1].id))
    expect(toggles().map((t) => t.getAttribute('aria-expanded'))).toEqual(['false', 'true'])

    await act(async () => useDemoStore.setState({ loupeOpen: false }))
    expect(toggles().map((t) => t.getAttribute('aria-expanded'))).toEqual(['false', 'false'])
  })
})

describe('ScenarioBoard full screen (mocked Fullscreen API)', () => {
  let container: HTMLDivElement
  let root: Root
  let current: Element | null = null
  const doc = document as unknown as Record<string, unknown>

  beforeEach(async () => {
    current = null
    doc.fullscreenEnabled = true
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => current })
    doc.exitFullscreen = vi.fn(() => {
      current = null
      return Promise.resolve()
    })
    HTMLElement.prototype.requestFullscreen = vi.fn(function (this: HTMLElement) {
      current = this
      return Promise.resolve()
    }) as never
    useAppStore.setState({
      observerHeightM: 2,
      cursorH: 0,
      playing: false,
      scenarios: [{ id: 'sc1', siteId: 'apollo_11', startUtc: '2027-01-01T00:00:00Z', durationH: 3, slipDays: 0 }],
      activeScenarioId: 'sc1',
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(ScenarioBoard)))
    await act(async () => useAppStore.getState().applyPreset(PRESET_APOLLO_VS_ARTEMIS))
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    delete doc.fullscreenEnabled
    delete doc.exitFullscreen
    delete doc.fullscreenElement
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen
  })

  it('the second card button enlarges its views, shows Transport and makes that scenario active', async () => {
    const buttons = [...container.querySelectorAll('button[aria-label="Full screen"]')] as HTMLButtonElement[]
    expect(buttons).toHaveLength(2)
    expect(container.querySelector('.transport')).toBeNull()

    await act(async () => buttons[1].click())
    await act(async () => void document.dispatchEvent(new Event('fullscreenchange')))

    const views = container.querySelectorAll('.views')[1]
    expect(current).toBe(views)
    expect(views.getAttribute('data-fullscreen')).toBe('true')
    expect(views.querySelector('.transport')).not.toBeNull()
    expect(views.querySelectorAll('[role="tab"]')).toHaveLength(3)
    expect(useAppStore.getState().activeScenarioId).toBe(useAppStore.getState().scenarios[1].id)

    await act(async () => {
      current = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(views.querySelector('.transport')).toBeNull()
  })
})
