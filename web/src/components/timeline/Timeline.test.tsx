// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timeline } from './Timeline'
import { useAppStore } from '../../state/store'
import type { SiteBundle } from '../../lib/types'
import * as useSiteBundleModule from '../../lib/useSiteBundle'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

describe('Timeline with Mission Bar', () => {
  let container: HTMLDivElement
  let root: Root

  const count = 336
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
      count,
      sun: { az: new Array(count).fill(0), el: new Array(count).fill(10) },
      earth: { az: new Array(count).fill(180), el: new Array(count).fill(45) },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.spyOn(useSiteBundleModule, 'useSiteBundle').mockReturnValue({
      status: 'ready',
      bundle: mockBundle,
      error: null,
    })

    act(() => {
      useAppStore.setState({
        observerHeightM: 2,
        cursorH: 10,
        scenarios: [
          {
            id: 'sc1',
            siteId: 'apollo_11',
            startUtc: '2026-12-01T00:00:00Z',
            durationH: 336,
            slipDays: 0,
          },
        ],
        missionRules: {
          observerHeightM: 2,
          missionDurationH: 240,
          minPctSunlit: 50,
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
    vi.restoreAllMocks()
  })

  it('renders mission bar and toggle button by default for 1 scenario', async () => {
    await act(async () => {
      root.render(createElement(Timeline, { scenarioId: 'sc1' }))
    })

    const toggle = container.querySelector('.tl__toggle')
    expect(toggle).not.toBeNull()
    expect(toggle?.textContent).toBe('Hide mission bar')

    const missionSlider = container.querySelector('[aria-label="Mission bar, Apollo 11"]')
    expect(missionSlider).not.toBeNull()
    expect(missionSlider?.getAttribute('role')).toBe('slider')
  })

  it('hides the mission bar when toggle is clicked', async () => {
    await act(async () => {
      root.render(createElement(Timeline, { scenarioId: 'sc1' }))
    })

    const toggle = container.querySelector('.tl__toggle') as HTMLButtonElement
    await act(async () => {
      toggle.click()
    })

    expect(toggle.textContent).toBe('Show mission bar')
    const missionSlider = container.querySelector('[aria-label="Mission bar, Apollo 11"]')
    expect(missionSlider).toBeNull()
  })

  it('moves mission start using keyboard Arrow keys without moving playback cursor', async () => {
    await act(async () => {
      root.render(createElement(Timeline, { scenarioId: 'sc1' }))
    })

    const initialCursorH = useAppStore.getState().cursorH
    const missionSlider = container.querySelector(
      '[aria-label="Mission bar, Apollo 11"]',
    ) as SVGGElement
    expect(missionSlider.getAttribute('aria-valuenow')).toBe('0')

    // Press ArrowRight (+1 h)
    await act(async () => {
      missionSlider.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(missionSlider.getAttribute('aria-valuenow')).toBe('1')

    // Press Shift + ArrowRight (+24 h -> total 25 h)
    await act(async () => {
      missionSlider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
        }),
      )
    })
    expect(missionSlider.getAttribute('aria-valuenow')).toBe('25')

    // Ensure playback cursor was NOT modified by mission bar interaction
    expect(useAppStore.getState().cursorH).toBe(initialCursorH)
  })

  it('sets landing date using the store action when clicking "Set as landing date"', async () => {
    const updateSpy = vi.spyOn(useAppStore.getState(), 'updateScenario')

    await act(async () => {
      root.render(createElement(Timeline, { scenarioId: 'sc1' }))
    })

    const missionSlider = container.querySelector(
      '[aria-label="Mission bar, Apollo 11"]',
    ) as SVGGElement

    // Move start by 24 hours (1 day later)
    await act(async () => {
      missionSlider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
        }),
      )
    })

    const applyBtn = container.querySelector('.tl__apply-btn') as HTMLButtonElement
    expect(applyBtn).not.toBeNull()

    await act(async () => {
      applyBtn.click()
    })

    expect(updateSpy).toHaveBeenCalledWith('sc1', {
      startUtc: '2026-12-02T00:00:00Z',
      slipDays: 0,
    })
  })

  it('preserves intra-day hour offset when setting landing date', async () => {
    const updateSpy = vi.spyOn(useAppStore.getState(), 'updateScenario')

    await act(async () => {
      root.render(createElement(Timeline, { scenarioId: 'sc1' }))
    })

    const missionSlider = container.querySelector(
      '[aria-label="Mission bar, Apollo 11"]',
    ) as SVGGElement

    // Move start by 25 hours (+24 h and +1 h)
    await act(async () => {
      missionSlider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          shiftKey: true,
          bubbles: true,
        }),
      )
    })
    await act(async () => {
      missionSlider.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          shiftKey: false,
          bubbles: true,
        }),
      )
    })
    expect(missionSlider.getAttribute('aria-valuenow')).toBe('25')

    const applyBtn = container.querySelector('.tl__apply-btn') as HTMLButtonElement
    await act(async () => {
      applyBtn.click()
    })

    expect(updateSpy).toHaveBeenCalledWith('sc1', {
      startUtc: '2026-12-02T00:00:00Z',
      slipDays: 0,
    })
    // Retains intra-day 1-hour offset instead of snapping back to 0
    expect(missionSlider.getAttribute('aria-valuenow')).toBe('1')
  })
})
