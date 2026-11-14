import { describe, expect, it, vi } from 'vitest'
import {
  cameraEase,
  getActiveScene,
  onSceneReady,
  registerActiveScene,
  triggerDemoCameraPan,
} from './cameraControl'
import type { SurfaceScene } from '../../viz3d/scene'
import { useAppStore } from '../../state/store'
import type { DemoStepContext } from './demoSteps'

describe('cameraEase helper', () => {
  it('correctly satisfies endpoints (0 -> 0, 1 -> 1, 0.5 -> 0.5)', () => {
    expect(cameraEase(0)).toBe(0)
    expect(cameraEase(1)).toBe(1)
    expect(cameraEase(0.5)).toBe(0.5)
  })

  it('clamps values below 0 to 0 and above 1 to 1', () => {
    expect(cameraEase(-0.2)).toBe(0)
    expect(cameraEase(-100)).toBe(0)
    expect(cameraEase(1.2)).toBe(1)
    expect(cameraEase(100)).toBe(1)
  })

  it('is strictly monotonic on (0, 1)', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]
    for (let i = 0; i < samples.length - 1; i++) {
      expect(cameraEase(samples[i])).toBeLessThanOrEqual(cameraEase(samples[i + 1]))
    }
  })
})

describe('cameraControl registry and pan trigger', () => {
  it('registers and unregisters active scene instance', () => {
    const mockScene = {} as unknown as SurfaceScene
    const unregister = registerActiveScene(mockScene)
    expect(getActiveScene()).toBe(mockScene)

    unregister()
    expect(getActiveScene()).toBeNull()
  })

  it('notifies onSceneReady listeners when scene is registered', () => {
    const readyListener = vi.fn()
    const cleanup = onSceneReady(readyListener)

    const mockScene = {} as unknown as SurfaceScene
    registerActiveScene(mockScene)

    expect(readyListener).toHaveBeenCalledWith(mockScene)
    cleanup()
  })

  it('triggers camera pan on active scene with ephemeris values at cursor', () => {
    const faceDirectionSpy = vi.fn()
    const cameraToSpy = vi.fn().mockResolvedValue(undefined)
    const mockScene = {
      faceDirection: faceDirectionSpy,
      cameraTo: cameraToSpy,
    } as unknown as SurfaceScene

    registerActiveScene(mockScene)

    useAppStore.setState({
      scenarios: [
        {
          id: 's1',
          siteId: 'site_1',
          startUtc: '2027-08-30T00:00:00Z',
          durationH: 100,
          slipDays: 0,
        },
      ],
      activeScenarioId: 's1',
      cursorH: 0,
    })

    const mockMeta = {
      contract_version: '1.0.0',
      generated_utc: '2027-08-30T00:00:00Z',
      generator: 'test',
      synthetic: false,
      approximate: false,
      inputs: [],
    }

    const ctx: DemoStepContext = {
      scenarios: useAppStore.getState().scenarios,
      bundles: [
        {
          site: {
            id: 'site_1',
            name: 'Site 1',
            category: 'apollo',
            mission: null,
            agency: null,
            country: null,
            elevation_m: null,
            landing_date_utc: null,
            region_radius_km: null,
            lat_deg: 0,
            lon_deg: 0,
            status: 'landed',
            source: { title: '', url: '' },
            notes: '',
          },
          horizon: {
            site_id: 'site_1',
            meta: mockMeta,
            observer_heights_m: [2],
            n: 360,
            az_step_deg: 1,
            masks: { '2': new Array(360).fill(0) },
          },
          ephem: {
            site_id: 'site_1',
            meta: mockMeta,
            count: 2,
            step_minutes: 60,
            start_utc: '2027-08-30T00:00:00Z',
            sun_ang_radius_deg: 0.26,
            earth_ang_radius_deg: 0.95,
            sun: { az: [45, 45], el: [10, 10] },
            earth: { az: [180, 180], el: [20, 20] },
          },
          terrain: null,
          provenance: 'real',
          synthetic: false,
          approximate: false,
        },
      ],
      metrics: [null],
      events: [[]],
    }

    triggerDemoCameraPan(ctx, 5000)

    // Should first look towards Sun's azimuth at cursor (45 deg)
    expect(faceDirectionSpy).toHaveBeenCalledWith(45, 10)
    // Then slowly pan towards Earth's azimuth at cursor (180 deg)
    expect(cameraToSpy).toHaveBeenCalledWith({
      azimuthDeg: 180,
      elevationDeg: 20,
      durationMs: 5000,
    })
  })
})
