// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurfaceView } from './SurfaceView'
import * as useSiteBundleModule from '../lib/useSiteBundle'
import * as useTerrainHeightsModule from './useTerrainHeights'
import * as bestSpotClientModule from './bestSpotClient'
import { useAppStore } from '../state/store'
import type { SiteBundle } from '../lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

vi.mock('./bestSpotClient', () => ({
  cancelBestSpotSearch: vi.fn(),
  findBestSpotAsync: vi.fn(),
}))

vi.mock('./heatmapTexture', () => {
  return {
    createHeatmapTexture: vi.fn().mockReturnValue({
      texture: { dispose: vi.fn() },
    }),
  }
})

vi.mock('./scene', () => {
  return {
    SurfaceScene: class {
      lookAtAzimuth = vi.fn()
      cameraTo = vi.fn().mockResolvedValue(undefined)
      faceBody = vi.fn().mockResolvedValue(undefined)
      lockOnDirection = vi.fn()
      updateLockDirection = vi.fn()
      centerOnLander = vi.fn()
      clearLock = vi.fn()
      setOnLockBreak = vi.fn()
      overviewElevationDeg = vi.fn().mockReturnValue(37)
      static last: unknown
      constructor() {
        ;(this.constructor as unknown as { last: unknown }).last = this
      }
      setSize = vi.fn()
      dispose = vi.fn()
      setHorizon = vi.fn()
      setOnUserLook = vi.fn()
      setMode = vi.fn()
      setExaggeration = vi.fn()
      setEyeHeight = vi.fn()
      setSky = vi.fn()
      setLanderOffset = vi.fn()
      setOnTerrainClick = vi.fn()
      setOnTerrainHover = vi.fn()
      setHeatmapTexture = vi.fn()
      invalidateShadow = vi.fn()
      animateLanderTo = vi.fn().mockResolvedValue({ finished: true, offset: { eastM: 0, northM: 0 } })
    },
  }
})

describe('SurfaceView 3D View Fixes', () => {
  let container: HTMLDivElement
  let root: Root

  const mockBundle: SiteBundle = {
    site: {
      id: 'mock_site',
      name: '[MOCK] Test Site',
      category: 'clps',
      mission: null,
      agency: null,
      country: null,
      lat_deg: -89.9,
      lon_deg: 0,
      elevation_m: 0,
      landing_date_utc: null,
      status: 'landed',
      region_radius_km: null,
      source: { title: 'NASA', url: '' },
      notes: '',
    },
    ephem: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: true,
        inputs: [],
      },
      site_id: 'mock_site',
      start_utc: '2026-01-01T00:00:00Z',
      step_minutes: 60,
      count: 24,
      sun: { az: new Array(24).fill(0), el: new Array(24).fill(1) },
      earth: { az: new Array(24).fill(0), el: new Array(24).fill(1) },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    },
    horizon: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: true,
        inputs: [],
      },
      site_id: 'mock_site',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2, 10],
      masks: {
        '2': new Array(360).fill(0),
        '10': new Array(360).fill(0),
      },
    },
    terrain: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: true,
        inputs: [],
      },
      site_id: 'mock_site',
      spacing_m: 80,
      size_px: 64,
      frame: 'local_tangent_enu',
      origin: 'site',
      encoding: 'uint16-le',
      bin: 'mock.bin',
      height_min_m: 0,
      height_max_m: 100,
      site_height_m: 0,
    },
    provenance: 'mock',
    synthetic: true,
    approximate: true,
  }

  const heights = new Float32Array(64 * 64).fill(0)

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    vi.spyOn(useSiteBundleModule, 'useSiteBundle').mockReturnValue({
      status: 'ready',
      bundle: mockBundle,
      error: null,
    })

    vi.spyOn(useTerrainHeightsModule, 'useTerrainHeights').mockReturnValue({
      status: 'ready',
      heights,
      error: null,
    })

    useAppStore.setState({
      scenarios: [
        {
          id: 'sc1',
          siteId: 'mock_site',
          startUtc: '2026-01-01T00:00:00Z',
          durationH: 24,
          slipDays: 0,
        },
      ],
      activeScenarioId: 'sc1',
      cursorH: 0,
      observerHeightM: 2,
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders lander position control with role="group", aria-roledescription="position control", and aria-label', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })

    const control = container.querySelector('.surface__nudge-control')
    expect(control).not.toBeNull()
    expect(control?.getAttribute('role')).toBe('group')
    expect(control?.getAttribute('aria-roledescription')).toBe('position control')
    expect(control?.getAttribute('aria-label')).toContain('Lander position')
    expect(control?.getAttribute('aria-label')).toContain('Arrow keys nudge')
  })

  it('Simple variant hides planner readouts and keeps the single search action', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1', variant: 'simple' }))
    })
    const text = container.textContent ?? ''
    for (const t of ['Offset', 'Terrain height', 'Radius', 'Sun visible hours', 'Approximate', 'Sunlight map', 'Reset position', 'Sun el', 'Earth lit', 'Terrain:', 'Earth imagery']) {
      expect(text).not.toContain(t)
    }
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toContain('Find the sunniest spot nearby')
    expect(labels).toContain('Face the Sun')
    expect(labels).not.toContain('Move back')
    const info = container.querySelector('button[aria-label="Terrain and image credits"]') as HTMLButtonElement
    await act(async () => {
      info.click()
    })
    expect(container.textContent).toContain('Earth imagery: NASA Blue Marble')
  })

  it('Face the Sun orbits the camera in Overview instead of being disabled', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const buttons = Array.from(container.querySelectorAll('button'))
    const overview = buttons.find((b) => b.textContent === 'Overview') as HTMLButtonElement
    await act(async () => {
      overview.click()
    })
    const face = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Face the Sun',
    ) as HTMLButtonElement
    expect(face.disabled).toBe(false)
    await act(async () => {
      face.click()
    })
    const { SurfaceScene } = await import('./scene')
    const scene = (SurfaceScene as unknown as { last: { cameraTo: ReturnType<typeof vi.fn>; faceBody: ReturnType<typeof vi.fn> } }).last
    expect(scene.faceBody).not.toHaveBeenCalled()
    expect(scene.cameraTo).toHaveBeenCalledWith({ azimuthDeg: 0, elevationDeg: 25, durationMs: 600 })
  })

  it('holding Face the Sun locks the camera, a click on it unlocks, Escape unlocks', async () => {
    vi.useFakeTimers()
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const find = (t: string) =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === t) as HTMLButtonElement
    const { SurfaceScene } = await import('./scene')
    const scene = (SurfaceScene as unknown as { last: Record<string, ReturnType<typeof vi.fn>> }).last
    const sun = find('Face the Sun')
    await act(async () => {
      sun.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(650)
    })
    expect(scene.lockOnDirection).toHaveBeenCalledTimes(1)
    const locked = find('Locked on the Sun')
    expect(locked.getAttribute('aria-pressed')).toBe('true')
    await act(async () => {
      locked.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
      locked.click()
    })
    expect(find('Locked on the Sun')).toBeTruthy()
    await act(async () => {
      find('Locked on the Sun').click()
    })
    expect(scene.cameraTo).not.toHaveBeenCalled()
    expect(find('Face the Sun').getAttribute('aria-pressed')).toBe('false')
    await act(async () => {
      find('Face the Sun').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(650)
    })
    expect(find('Locked on the Sun')).toBeTruthy()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(find('Face the Sun').getAttribute('aria-pressed')).toBe('false')
    vi.useRealTimers()
  })

  it('Face the lander is disabled on the surface and centres the lander in Overview', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const find = (t: string) =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === t) as HTMLButtonElement
    expect(find('Face the lander').disabled).toBe(true)
    await act(async () => {
      find('Overview').click()
    })
    await act(async () => {
      find('Face the lander').click()
    })
    const { SurfaceScene } = await import('./scene')
    const scene = (SurfaceScene as unknown as { last: Record<string, ReturnType<typeof vi.fn>> }).last
    expect(scene.centerOnLander).toHaveBeenCalledWith(false)
  })

  it('renders badges in lander box (Approximate and Synthetic)', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })

    const hoursRow = container.querySelector('.surface__hours-row')
    expect(hoursRow).not.toBeNull()
    const badges = hoursRow?.querySelectorAll('.badge')
    const badgeTexts = Array.from(badges ?? []).map((b) => b.textContent)
    expect(badgeTexts).toContain('Approximate')
    expect(badgeTexts).toContain('Synthetic data')
  })

  it('top badge says terrain patch plus horizon mask while the lander is at the site', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const texts = Array.from(container.querySelectorAll('.surface__badges .badge')).map((b) => b.textContent)
    expect(texts).toContain('Local terrain patch + horizon mask')
    expect(texts).not.toContain('Approximate (terrain patch only)')
  })

  it('renders vertical exaggeration slider with aria-label="Vertical exaggeration"', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })

    const slider = container.querySelector('input[type="range"][aria-label="Vertical exaggeration"]')
    expect(slider).not.toBeNull()
  })

  it('renders sunlight map legend with badges and cell inspector without tabIndex and with aria-live="polite"', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })

    // Click Sunlight map toggle button
    const buttons = Array.from(container.querySelectorAll('button'))
    const mapBtn = buttons.find((b) => b.textContent?.includes('Sunlight map'))
    expect(mapBtn).toBeDefined()

    await act(async () => {
      mapBtn?.click()
    })

    // Now heatmap panel is rendered
    const heatmapPanel = container.querySelector('.surface__heatmap-panel')
    expect(heatmapPanel).not.toBeNull()

    // Inspector readout should NOT have tabIndex
    const inspector = container.querySelector('.surface__cell-inspector')
    expect(inspector?.getAttribute('tabIndex')).toBeNull()
    expect(inspector?.getAttribute('aria-live')).toBe('polite')
  })

  it('renders sunniest spot result card with role="status" and aria-live="polite"', async () => {
    vi.mocked(bestSpotClientModule.findBestSpotAsync).mockResolvedValueOnce({
      result: {
        row: 10,
        col: 12,
        index: 120,
        offset: { eastM: 100, northM: 200 },
        distanceM: 223.6,
        sunlitVal: 85,
        slopeDeg: 3.2,
      },
    })

    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })

    const findBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Find sunniest spot'),
    )
    expect(findBtn).toBeDefined()

    await act(async () => {
      findBtn?.click()
    })

    const resultCard = container.querySelector('.surface__result-card')
    expect(resultCard).not.toBeNull()
    expect(resultCard?.getAttribute('role')).toBe('status')
    expect(resultCard?.getAttribute('aria-live')).toBe('polite')
    expect(resultCard?.getAttribute('aria-label')).toBe('Sunniest spot result')
  })

  it('displays "Outside ephemeris coverage" when search returns no result on out-of-range dates', async () => {
    vi.mocked(bestSpotClientModule.findBestSpotAsync).mockResolvedValueOnce({
      result: null,
    })

    // Set scenario dates outside the 2026-01-01 ephemeris coverage
    useAppStore.setState({
      scenarios: [
        {
          id: 'sc1',
          siteId: 'mock_site',
          startUtc: '2028-06-01T00:00:00Z',
          durationH: 24,
          slipDays: 0,
        },
      ],
      activeScenarioId: 'sc1',
      cursorH: 0,
      observerHeightM: 2,
    })

    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })

    const findBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Find sunniest spot'),
    )
    expect(findBtn).toBeDefined()

    await act(async () => {
      findBtn?.click()
    })

    const alert = container.querySelector('.surface__best-spot-alert')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toBe('Outside ephemeris coverage')
  })
})
