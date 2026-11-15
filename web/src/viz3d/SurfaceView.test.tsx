// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SurfaceView } from './SurfaceView'
import * as useSiteBundleModule from '../lib/useSiteBundle'
import * as useTerrainHeightsModule from './useTerrainHeights'
import * as bestSpotClientModule from './bestSpotClient'
import * as localIllumClientModule from './localIllumClient'
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

// The original point is fully shadowed and any moved point is open, so a found spot has a real gain.
vi.mock('./terrainHorizon', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./terrainHorizon')>()
  return {
    ...orig,
    horizonFromTerrain: (...args: Parameters<typeof orig.horizonFromTerrain>) =>
      new Float32Array(360).fill(args[3] === 0 && args[4] === 0 ? 90 : -90),
  }
})

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
      faceLander = vi.fn().mockResolvedValue(undefined)
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
      cancelLanderAnimation = vi.fn()
      currentLanderOffset = vi.fn().mockReturnValue({ eastM: 0, northM: 0 })
      walkFrame = vi.fn().mockReturnValue({ yawDeg: 0, speedMps: 8 })
      panBy = vi.fn()
      lookKey = vi.fn().mockReturnValue(true)
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

  it('Simple variant hides planner readouts, credits and the search action', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1', variant: 'simple' }))
    })
    const text = container.textContent ?? ''
    for (const t of ['Offset', 'Terrain height', 'Radius', 'Sun visible hours', 'Approximate', 'Sunlight map', 'Reset position', 'Sun el', 'Earth lit', 'Terrain:', 'Earth imagery', 'most Sun visible']) {
      expect(text).not.toContain(t)
    }
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Face the Sun', 'Face the Earth', 'Face the lander']))
    expect(container.querySelector('button[aria-label="Terrain and image credits"]')).toBeNull()
    const radios = Array.from(container.querySelectorAll('[role="radiogroup"] [role="radio"]'))
    expect(radios.map((r) => r.textContent)).toEqual(['On the surface', 'Overview'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    await act(async () => {
      ;(radios[1] as HTMLButtonElement).click()
    })
    expect(radios[1].getAttribute('aria-checked')).toBe('true')
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

  it('arrow keys on the 3D view do not move the lander or seek time', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1', variant: 'simple' }))
    })
    const frame = container.querySelector('.surface__frame') as HTMLElement
    expect(frame.hasAttribute('data-no-shortcuts')).toBe(true)
    expect(frame.getAttribute('aria-label')).not.toContain('move the lander')
    const { SurfaceScene } = await import('./scene')
    const scene = (SurfaceScene as unknown as { last: Record<string, ReturnType<typeof vi.fn>> }).last
    scene.setLanderOffset.mockClear()
    await act(async () => {
      frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(scene.setLanderOffset).not.toHaveBeenCalled()
  })

  describe('WASD walking', () => {
    type MockScene = Record<string, ReturnType<typeof vi.fn>>
    const getScene = async () => {
      const { SurfaceScene } = await import('./scene')
      return (SurfaceScene as unknown as { last: MockScene }).last
    }
    const key = (el: Element, type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) =>
      el.dispatchEvent(
        new KeyboardEvent(type, { key: code.slice(3).toLowerCase(), code, bubbles: true, cancelable: true, ...init }),
      )
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const lastCall = (scene: MockScene) => scene.setLanderOffset.mock.calls.at(-1) as [number, number]

    it('arrow keys only turn the view and never move the lander (Advanced)', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
      })
      const canvasHolder = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      scene.setLanderOffset.mockClear()
      await act(async () => {
        for (const code of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) key(canvasHolder, 'keydown', code)
        await wait(120)
        for (const code of ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']) key(canvasHolder, 'keyup', code)
      })
      expect(scene.setLanderOffset).not.toHaveBeenCalled()
      // The frame forwards arrows to the scene look motion.
      expect(scene.lookKey).toHaveBeenCalled()
    })

    it('W walks the lander along the view in Advanced and the readout follows when it stops', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
      })
      const frame = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      scene.setLanderOffset.mockClear()
      await act(async () => {
        key(frame, 'keydown', 'KeyW')
        await wait(500)
        key(frame, 'keyup', 'KeyW')
        await wait(500)
      })
      const [e, n] = lastCall(scene)
      expect(e).toBeCloseTo(0, 6)
      expect(n).toBeGreaterThan(1)
      expect(n).toBeLessThan(5)
      const label = container.querySelector('.surface__nudge-control')?.getAttribute('aria-label') ?? ''
      expect(label).toMatch(/\+0 m E, \+[1-9]\d* m N/)
      // Reset position is available again.
      const reset = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Reset position')
      expect((reset as HTMLButtonElement).disabled).toBe(false)
    })

    it('D strafes to the right of the view and Shift is faster', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
      })
      const frame = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      scene.setLanderOffset.mockClear()
      await act(async () => {
        key(frame, 'keydown', 'KeyD')
        await wait(300)
        key(frame, 'keyup', 'KeyD')
        await wait(300)
      })
      const [e1, n1] = lastCall(scene)
      expect(e1).toBeGreaterThan(0.3)
      expect(n1).toBeCloseTo(0, 6)
      scene.setLanderOffset.mockClear()
      scene.currentLanderOffset.mockReturnValue({ eastM: 0, northM: 0 })
      await act(async () => {
        key(frame, 'keydown', 'KeyD', { shiftKey: true })
        await wait(300)
        key(frame, 'keyup', 'KeyD', { shiftKey: true })
        await wait(300)
      })
      expect(lastCall(scene)[0]).toBeGreaterThan(e1 * 2)
    })

    it('does not walk with Ctrl, Meta or Alt, in an input or a slider, or with the focus on a button', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
      })
      const frame = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      scene.setLanderOffset.mockClear()
      const slider = container.querySelector('input[type="range"]') as HTMLInputElement
      const select = container.querySelector('select') as HTMLSelectElement
      const button = container.querySelector('button') as HTMLButtonElement
      await act(async () => {
        key(frame, 'keydown', 'KeyW', { ctrlKey: true })
        key(frame, 'keydown', 'KeyA', { metaKey: true })
        key(frame, 'keydown', 'KeyS', { altKey: true })
        key(slider, 'keydown', 'KeyW')
        key(select, 'keydown', 'KeyW')
        key(button, 'keydown', 'KeyW')
        await wait(150)
      })
      expect(scene.setLanderOffset).not.toHaveBeenCalled()
    })

    it('blur stops a walk at once and keeps the position', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
      })
      const frame = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      scene.setLanderOffset.mockClear()
      await act(async () => {
        key(frame, 'keydown', 'KeyW')
        await wait(200)
        window.dispatchEvent(new Event('blur'))
        await wait(50)
      })
      const calls = scene.setLanderOffset.mock.calls.length
      expect(calls).toBeGreaterThan(0)
      await act(async () => {
        await wait(200)
      })
      expect(scene.setLanderOffset.mock.calls.length).toBe(calls)
    })

    it('in Simple the walk is visual only: no readouts or metrics, and Back to start appears', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1', variant: 'simple' }))
      })
      const frame = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      scene.setLanderOffset.mockClear()
      const textBefore = container.textContent
      const find = (t: string) =>
        Array.from(container.querySelectorAll('button')).find((b) => b.textContent === t) as HTMLButtonElement | undefined
      expect(find('Back to start')).toBeUndefined()
      await act(async () => {
        key(frame, 'keydown', 'KeyW')
        await wait(400)
        key(frame, 'keyup', 'KeyW')
        await wait(400)
      })
      expect(lastCall(scene)[1]).toBeGreaterThan(1)
      for (const t of ['Offset', ' m N', 'Moved', 'Sun visible hours', 'Approximate']) {
        expect(container.textContent).not.toContain(t)
      }
      expect(container.textContent?.replace('Back to start', '')).toBe(textBefore)
      const back = find('Back to start')
      expect(back).toBeDefined()
      await act(async () => {
        back?.click()
      })
      expect(scene.animateLanderTo).toHaveBeenLastCalledWith({ eastM: 0, northM: 0 }, expect.any(Number))
      await act(async () => {
        await wait(400)
      })
      expect(find('Back to start')).toBeUndefined()
    })

    it('in Overview WASD pans the view instead of moving the lander', async () => {
      await act(async () => {
        root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
      })
      const frame = container.querySelector('.surface__frame') as HTMLElement
      const scene = await getScene()
      const overview = Array.from(container.querySelectorAll('[role="radio"]')).find(
        (r) => r.textContent === 'Overview',
      ) as HTMLButtonElement
      await act(async () => {
        overview.click()
      })
      scene.setLanderOffset.mockClear()
      await act(async () => {
        key(frame, 'keydown', 'KeyW')
        await wait(200)
        key(frame, 'keyup', 'KeyW')
        await wait(400)
      })
      expect(scene.panBy).toHaveBeenCalled()
      expect(scene.setLanderOffset).not.toHaveBeenCalled()
    })
  })

  it('Face the lander works on the surface and in Overview', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const find = (t: string) =>
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === t) as HTMLButtonElement
    const { SurfaceScene } = await import('./scene')
    const scene = (SurfaceScene as unknown as { last: Record<string, ReturnType<typeof vi.fn>> }).last
    expect(find('Face the lander').disabled).toBe(false)
    await act(async () => {
      find('Face the lander').click()
    })
    expect(scene.faceLander).toHaveBeenCalledTimes(1)
    await act(async () => {
      find('Overview').click()
    })
    await act(async () => {
      find('Face the lander').click()
    })
    expect(scene.faceLander).toHaveBeenCalledTimes(2)
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

  it('renders the corner slot (full screen button) inside the 3D frame, next to the badges', async () => {
    await act(async () => {
      root.render(
        createElement(SurfaceView, {
          scenarioId: 'sc1',
          cornerSlot: createElement('button', { type: 'button', 'aria-label': 'Full screen' }),
        }),
      )
    })
    const frame = container.querySelector('.surface__frame')
    expect(frame?.querySelector('.surface__corner button[aria-label="Full screen"]')).not.toBeNull()
    expect(container.querySelectorAll('.surface__side button[aria-label="Full screen"]')).toHaveLength(0)
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

    // Overlaid colour legend on the canvas, shown with the map
    const legend = container.querySelector('.surface__frame .surface__map-legend')
    expect(legend).not.toBeNull()
    expect(legend?.getAttribute('role')).toBe('img')
    expect(legend?.getAttribute('aria-label')).toContain('Sunlight map colour scale')
    expect(legend?.textContent).toContain('Sun visible')

    // Inspector readout should NOT have tabIndex
    const inspector = container.querySelector('.surface__cell-inspector')
    expect(inspector?.getAttribute('tabIndex')).toBeNull()
    expect(inspector?.getAttribute('aria-live')).toBe('polite')
  })

  it('shows the computing text in the legend slot on the canvas, not as a card below it', async () => {
    const spy = vi.spyOn(localIllumClientModule, 'localSunlitGridAsync').mockReturnValue(new Promise(() => {}))
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const mapBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Sunlight map') as HTMLButtonElement
    expect(mapBtn.hasAttribute('data-loading')).toBe(false)
    await act(async () => {
      mapBtn.click()
    })
    const chip = container.querySelector('.surface__frame .surface__chipslot .surface__map-computing')
    expect(chip?.textContent).toBe('Computing sunlight map…')
    expect(mapBtn.hasAttribute('data-loading')).toBe(true)
    expect(container.querySelector('.surface__heatmap-panel')).toBeNull()
    expect(container.textContent).not.toContain('Computing sunlight map...')
    spy.mockRestore()
  })

  it('draws the loading outline as an aria-hidden SVG overlay with two segments, only while computing', async () => {
    const spy = vi.spyOn(localIllumClientModule, 'localSunlitGridAsync').mockReturnValue(new Promise(() => {}))
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const mapBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Sunlight map') as HTMLButtonElement
    expect(mapBtn.querySelector('.surface__mapbtn-ring')).toBeNull()
    await act(async () => {
      mapBtn.click()
    })
    const ring = mapBtn.querySelector('svg.surface__mapbtn-ring')
    expect(ring?.getAttribute('aria-hidden')).toBe('true')
    const segs = ring?.querySelectorAll('rect')
    expect(segs?.length).toBe(2)
    expect(segs?.[0].getAttribute('pathLength')).toBe('100')
    expect(mapBtn.textContent).toBe('Sunlight map')
    spy.mockRestore()
  })

  it('moves the lander readouts into a popover on the frame that opens, closes with Escape and returns focus', async () => {
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    expect(container.querySelector('details.surface__more')).toBeNull()
    const panel = container.querySelector('.surface__frame .surface__lander-panel') as HTMLElement
    expect(panel).not.toBeNull()
    expect(panel.getAttribute('data-state')).toBe('closed')
    expect(panel.querySelector('.surface__nudge-control')).not.toBeNull()
    expect(container.querySelector('.surface__controls .surface__nudge-control')).toBeNull()
    const btn = container.querySelector('.surface__lander-btn') as HTMLButtonElement
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    await act(async () => {
      btn.click()
    })
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(panel.getAttribute('data-state')).toBe('open')
    expect(document.activeElement).toBe(panel.querySelector('.surface__nudge-control'))
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(panel.getAttribute('data-state')).toBe('closed')
    expect(document.activeElement).toBe(btn)
  })

  it('a quick click on Face the Sun shows no hold visuals, a long press does', async () => {
    vi.useFakeTimers()
    await act(async () => {
      root.render(createElement(SurfaceView, { scenarioId: 'sc1' }))
    })
    const sun = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Face the Sun') as HTMLButtonElement
    await act(async () => {
      sun.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(100)
    })
    expect(sun.hasAttribute('data-holding')).toBe(false)
    await act(async () => {
      sun.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(1000)
    })
    expect(sun.hasAttribute('data-holding')).toBe(false)
    await act(async () => {
      sun.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      vi.advanceTimersByTime(300)
    })
    expect(sun.hasAttribute('data-holding')).toBe(true)
    expect(sun.querySelector('.lockbtn__ring')).not.toBeNull()
    vi.useRealTimers()
  })

  it('renders best spot result card with role="status" and aria-live="polite"', async () => {
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
      b.textContent?.includes('Find spot with most Sun visible'),
    )
    expect(findBtn).toBeDefined()

    await act(async () => {
      findBtn?.click()
    })

    const resultCard = container.querySelector('.surface__chip--result')
    expect(resultCard).not.toBeNull()
    expect(resultCard?.closest('.surface__frame')).not.toBeNull()
    expect(resultCard?.getAttribute('role')).toBe('status')
    expect(resultCard?.getAttribute('aria-label')).toBe('Best spot result')
    expect(container.querySelector('.surface__controls .surface__chip')).toBeNull()
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
      b.textContent?.includes('Find spot with most Sun visible'),
    )
    expect(findBtn).toBeDefined()

    await act(async () => {
      findBtn?.click()
    })

    const alert = container.querySelector('.surface__chip--error')
    expect(alert).not.toBeNull()
    expect(alert?.getAttribute('role')).toBe('alert')
    expect(alert?.textContent).toContain('Outside ephemeris coverage')
  })
})
