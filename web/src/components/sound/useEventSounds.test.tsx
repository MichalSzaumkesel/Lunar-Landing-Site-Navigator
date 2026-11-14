// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import { createSoundEngine } from '../../lib/sound'
import { useEventSounds } from './useEventSounds'
import * as useSiteBundleModule from '../../lib/useSiteBundle'
import type { SiteBundle } from '../../lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('useEventSounds', () => {
  let container: HTMLDivElement
  let root: Root

  // Horizon with constant 0 deg mask
  // Sun starts above horizon at k=0 (el=10), dips below horizon at k=1 (el=-10) -> sunset between k=0 and k=1
  // Start: 2026-11-14T00:00:00Z, step: 60 min. k=0 is 0h, k=1 is 1h.
  // Sunset interpolated at 0.5h (1800000 ms from start).
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
      start_utc: '2026-11-14T00:00:00Z',
      step_minutes: 60,
      count: 24,
      sun: {
        az: new Array(24).fill(0),
        el: [10, -10, -10, 10, ...new Array(20).fill(10)],
      },
      earth: { az: new Array(24).fill(180), el: new Array(24).fill(45) },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }

  function SoundTestComponent({
    engine,
  }: {
    engine: ReturnType<typeof createSoundEngine>
  }) {
    useEventSounds(engine)
    return null
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
        activeScenarioId: 'sc1',
        observerHeightM: 2,
        cursorH: 0,
        playing: false,
        speedHPerSec: 1,
        scenarios: [
          {
            id: 'sc1',
            siteId: 'apollo_11',
            startUtc: '2026-11-14T00:00:00Z',
            durationH: 24,
            slipDays: 0,
          },
        ],
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

  it('does not trigger cues when paused or when sound is off', async () => {
    const engine = createSoundEngine()
    const cueSpy = vi.spyOn(engine, 'cue')

    await act(async () => {
      root.render(createElement(SoundTestComponent, { engine }))
    })

    // Advance cursor while paused
    act(() => {
      useAppStore.setState({ cursorH: 1 })
    })

    expect(cueSpy).not.toHaveBeenCalled()

    // Enable cues but keep playing false
    engine.setMode('cues')
    act(() => {
      useAppStore.setState({ cursorH: 2 })
    })

    expect(cueSpy).not.toHaveBeenCalled()
  })

  it('triggers cues when playing is true and sound mode is "cues"', async () => {
    const engine = createSoundEngine()
    engine.setMode('cues')
    const cueSpy = vi.spyOn(engine, 'cue')

    await act(async () => {
      root.render(createElement(SoundTestComponent, { engine }))
    })

    // Start playing at cursor 0
    act(() => {
      useAppStore.setState({ playing: true, cursorH: 0 })
    })

    // Advance cursor past sunset (sunset is at 0.5h)
    act(() => {
      useAppStore.setState({ cursorH: 0.8 })
    })

    expect(cueSpy).toHaveBeenCalledWith('sunset')
  })

  it('updates ambient sound in "ambient" mode and suppresses beeps', async () => {
    const engine = createSoundEngine()
    engine.setMode('ambient')
    const cueSpy = vi.spyOn(engine, 'cue')
    const updateAmbientSpy = vi.spyOn(engine, 'updateAmbient')

    await act(async () => {
      root.render(createElement(SoundTestComponent, { engine }))
    })

    // Initial mount pushes ambient update
    expect(updateAmbientSpy).toHaveBeenCalled()

    // Advance cursor while playing
    act(() => {
      useAppStore.setState({ playing: true, cursorH: 0.8 })
    })

    // Ambient mode does not trigger cue beeps
    expect(cueSpy).not.toHaveBeenCalled()

    // Ambient mode updates sound parameters based on Sun and Earth
    expect(updateAmbientSpy).toHaveBeenCalled()
    const lastCall = updateAmbientSpy.mock.calls.at(-1)?.[0]
    expect(lastCall).toBeDefined()
    expect(lastCall?.sun).toBeDefined()
    expect(lastCall?.earth).toBeDefined()
  })

  it('syncs playing state with engine and triggers scrub swell when cursor moves while paused', async () => {
    const engine = createSoundEngine()
    engine.setMode('ambient')
    const setPlayingSpy = vi.spyOn(engine, 'setPlaying')
    const scrubSwellSpy = vi.spyOn(engine, 'triggerScrubSwell')

    await act(async () => {
      root.render(createElement(SoundTestComponent, { engine }))
    })

    // Initial mount syncs playing (false)
    expect(setPlayingSpy).toHaveBeenCalledWith(false)
    expect(scrubSwellSpy).not.toHaveBeenCalled()

    // Scrub cursor while paused -> triggers scrub swell
    act(() => {
      useAppStore.setState({ cursorH: 0.5 })
    })
    expect(scrubSwellSpy).toHaveBeenCalledTimes(1)

    // Start playing -> calls setPlaying(true)
    act(() => {
      useAppStore.setState({ playing: true })
    })
    expect(setPlayingSpy).toHaveBeenCalledWith(true)

    // Stop playing -> calls setPlaying(false)
    act(() => {
      useAppStore.setState({ playing: false })
    })
    expect(setPlayingSpy).toHaveBeenCalledWith(false)
  })

  it('skips cues when playback speed exceeds 72 h/s', async () => {
    const engine = createSoundEngine()
    engine.setMode('cues')
    const cueSpy = vi.spyOn(engine, 'cue')

    await act(async () => {
      root.render(createElement(SoundTestComponent, { engine }))
    })

    act(() => {
      useAppStore.setState({ playing: true, speedHPerSec: 80, cursorH: 0 })
    })

    act(() => {
      useAppStore.setState({ cursorH: 1.0 })
    })

    expect(cueSpy).not.toHaveBeenCalled()
  })

  it('skips cues on seek forward > 12 h or backward jump', async () => {
    const engine = createSoundEngine()
    engine.setMode('cues')
    const cueSpy = vi.spyOn(engine, 'cue')

    await act(async () => {
      root.render(createElement(SoundTestComponent, { engine }))
    })

    act(() => {
      useAppStore.setState({ playing: true, cursorH: 0 })
    })

    // Seek forward by 15 hours
    act(() => {
      useAppStore.setState({ cursorH: 15 })
    })

    expect(cueSpy).not.toHaveBeenCalled()

    // Seek backward
    act(() => {
      useAppStore.setState({ cursorH: 0.2 })
    })

    expect(cueSpy).not.toHaveBeenCalled()
  })
})
