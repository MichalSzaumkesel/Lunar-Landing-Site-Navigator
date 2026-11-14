import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  azimuthToPan,
  computeAmbientParams,
  createSoundEngine,
  cuePlan,
  earthLitFractionToBrightness,
  elevationToFilterCutoff,
  findEventsBetween,
  fractionToGain,
  loadSoundPreference,
  loadSoundVolume,
  resetSoundEngine,
  saveSoundPreference,
  saveSoundVolume,
  shouldPlayCue,
  shouldUpdateAmbient,
  SOUND_STORAGE_KEY,
  SOUND_VOLUME_STORAGE_KEY,
} from './sound'
import type { SkyEvent } from './events'
import type { SiteBundle } from './types'

describe('cuePlan', () => {
  it('returns two falling sine notes for sunset (440 Hz then 330 Hz, 0.18 s each)', () => {
    const plan = cuePlan('sunset')
    expect(plan).toEqual([
      { frequency: 440, startOffset: 0, duration: 0.18 },
      { frequency: 330, startOffset: 0.18, duration: 0.18 },
    ])
  })

  it('returns two rising sine notes for sunrise (330 Hz then 440 Hz, 0.18 s each)', () => {
    const plan = cuePlan('sunrise')
    expect(plan).toEqual([
      { frequency: 330, startOffset: 0, duration: 0.18 },
      { frequency: 440, startOffset: 0.18, duration: 0.18 },
    ])
  })

  it('returns one low soft tone for earthset (261 Hz, 0.3 s)', () => {
    const plan = cuePlan('earthset')
    expect(plan).toEqual([{ frequency: 261, startOffset: 0, duration: 0.3 }])
  })

  it('returns one higher tone for earthrise (392 Hz, 0.3 s)', () => {
    const plan = cuePlan('earthrise')
    expect(plan).toEqual([{ frequency: 392, startOffset: 0, duration: 0.3 }])
  })
})

describe('shouldPlayCue (rate limiting)', () => {
  it('allows cue when interval >= 350 ms', () => {
    expect(shouldPlayCue(1000, 650, 350)).toBe(true)
    expect(shouldPlayCue(1000, 500, 350)).toBe(true)
    expect(shouldPlayCue(350, 0, 350)).toBe(true)
  })

  it('suppresses cue when interval < 350 ms', () => {
    expect(shouldPlayCue(1000, 700, 350)).toBe(false)
    expect(shouldPlayCue(1000, 999, 350)).toBe(false)
    expect(shouldPlayCue(349, 0, 350)).toBe(false)
  })
})

describe('findEventsBetween (event-window selection)', () => {
  const events: SkyEvent[] = [
    { kind: 'sunrise', ms: 1_000_000, utc: '2026-11-14T00:16:40Z' },
    { kind: 'sunset', ms: 2_000_000, utc: '2026-11-14T00:33:20Z' },
    { kind: 'earthrise', ms: 3_000_000, utc: '2026-11-14T00:50:00Z' },
    { kind: 'earthset', ms: 4_000_000, utc: '2026-11-14T01:06:40Z' },
  ]

  it('returns events falling between prevMs and currMs (prevMs < e.ms <= currMs)', () => {
    const result = findEventsBetween(events, 1_500_000, 3_000_000, 10)
    expect(result.map((e) => e.kind)).toEqual(['sunset', 'earthrise'])
  })

  it('excludes events exactly equal to prevMs but includes events equal to currMs', () => {
    const result = findEventsBetween(events, 1_000_000, 2_000_000, 10)
    expect(result.map((e) => e.kind)).toEqual(['sunset'])
  })

  it('skips all cues when playback speed exceeds 72 h/s', () => {
    const normal = findEventsBetween(events, 500_000, 2_500_000, 72)
    expect(normal.length).toBe(2)

    const tooFast = findEventsBetween(events, 500_000, 2_500_000, 72.1)
    expect(tooFast).toEqual([])
  })

  it('skips all cues when cursor jumped backwards (currMs < prevMs)', () => {
    const backwards = findEventsBetween(events, 3_000_000, 1_000_000, 10)
    expect(backwards).toEqual([])
  })

  it('skips all cues when cursor jumped forward by more than 12 hours (manual seek)', () => {
    const twelveHoursMs = 12 * 3600 * 1000
    const exact12 = findEventsBetween(
      events,
      100_000,
      100_000 + twelveHoursMs,
      10,
    )
    expect(exact12.length).toBe(4)

    const jump = findEventsBetween(
      events,
      100_000,
      100_000 + twelveHoursMs + 1,
      10,
    )
    expect(jump).toEqual([])
  })
})

describe('fractionToGain (smooth gain curve)', () => {
  it('maps fraction 0 to 0 (true silence)', () => {
    expect(fractionToGain(0)).toBe(0)
  })

  it('maps negative fractions to 0', () => {
    expect(fractionToGain(-0.5)).toBe(0)
  })

  it('maps fraction 1 to 1', () => {
    expect(fractionToGain(1)).toBe(1)
  })

  it('maps fractions > 1 to 1', () => {
    expect(fractionToGain(1.5)).toBe(1)
  })

  it('makes half-cut disc (fraction 0.5) clearly quieter (gain 0.25)', () => {
    expect(fractionToGain(0.5)).toBe(0.25)
  })

  it('is strictly monotonic between 0 and 1', () => {
    const steps = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
    const gains = steps.map(fractionToGain)
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]).toBeGreaterThan(gains[i - 1])
    }
  })
})

describe('elevationToFilterCutoff (Sun voice brightness)', () => {
  it('returns base cutoff of 1800 Hz for elevation <= 0', () => {
    expect(elevationToFilterCutoff(0)).toBe(1800)
    expect(elevationToFilterCutoff(-10)).toBe(1800)
  })

  it('opens filter smoothly as elevation rises', () => {
    const cutoff10 = elevationToFilterCutoff(10)
    const cutoff30 = elevationToFilterCutoff(30)
    const cutoff60 = elevationToFilterCutoff(60)

    expect(cutoff10).toBeGreaterThan(1800)
    expect(cutoff30).toBeGreaterThan(cutoff10)
    expect(cutoff60).toBeGreaterThan(cutoff30)
    expect(cutoff60).toBe(5000)
  })

  it('caps at max cutoff (5000 Hz) for elevation above 60 deg', () => {
    expect(elevationToFilterCutoff(75)).toBe(5000)
    expect(elevationToFilterCutoff(90)).toBe(5000)
  })
})

describe('earthLitFractionToBrightness (Earth voice brightness)', () => {
  it('returns 900 Hz for completely dark crescent (litFraction 0)', () => {
    expect(earthLitFractionToBrightness(0)).toBe(900)
    expect(earthLitFractionToBrightness(-0.1)).toBe(900)
  })

  it('returns 3000 Hz for full Earth (litFraction 1)', () => {
    expect(earthLitFractionToBrightness(1)).toBe(3000)
    expect(earthLitFractionToBrightness(1.2)).toBe(3000)
  })

  it('returns intermediate cutoff for quarter / half Earth', () => {
    expect(earthLitFractionToBrightness(0.5)).toBe(1950)
  })
})

describe('azimuthToPan (stereo panning with wrap)', () => {
  it('pans North (0 deg) to centre (0)', () => {
    expect(azimuthToPan(0)).toBe(0)
  })

  it('pans East (90 deg) to right (+1)', () => {
    expect(azimuthToPan(90)).toBe(1)
  })

  it('pans South (180 deg) to centre (0)', () => {
    expect(azimuthToPan(180)).toBe(0)
  })

  it('pans West (270 deg) to left (-1)', () => {
    expect(azimuthToPan(270)).toBe(-1)
  })

  it('wraps full circles (360 deg, 450 deg, 720 deg)', () => {
    expect(azimuthToPan(360)).toBe(0)
    expect(azimuthToPan(450)).toBe(1)
    expect(azimuthToPan(720)).toBe(0)
  })

  it('handles negative angles (-90 deg, -180 deg)', () => {
    expect(azimuthToPan(-90)).toBe(-1)
    expect(azimuthToPan(-180)).toBe(0)
  })

  it('stays strictly within [-1, 1]', () => {
    for (let az = -360; az <= 720; az += 15) {
      const pan = azimuthToPan(az)
      expect(pan).toBeGreaterThanOrEqual(-1)
      expect(pan).toBeLessThanOrEqual(1)
    }
  })
})

describe('shouldUpdateAmbient (update rate limiter)', () => {
  it('allows updates when interval >= 1000/15 ms (~66.7 ms)', () => {
    expect(shouldUpdateAmbient(100, 0, 66.67)).toBe(true)
    expect(shouldUpdateAmbient(67, 0, 66.67)).toBe(true)
  })

  it('suppresses updates when interval < 1000/15 ms', () => {
    expect(shouldUpdateAmbient(50, 0, 66.67)).toBe(false)
    expect(shouldUpdateAmbient(65, 0, 66.67)).toBe(false)
  })
})

describe('sound preference persistence', () => {
  it('defaults to "off" when localStorage is empty', () => {
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
    })

    expect(loadSoundPreference()).toBe('off')
    vi.unstubAllGlobals()
  })

  it('saves and loads "ambient", "cues", and "off" modes correctly', () => {
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
    })

    saveSoundPreference('ambient')
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('ambient')
    expect(loadSoundPreference()).toBe('ambient')

    saveSoundPreference('cues')
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('cues')
    expect(loadSoundPreference()).toBe('cues')

    saveSoundPreference('off')
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('off')
    expect(loadSoundPreference()).toBe('off')

    vi.unstubAllGlobals()
  })

  it('translates legacy boolean values into modes', () => {
    const mockStorage: Record<string, string> = {
      [SOUND_STORAGE_KEY]: 'true',
    }
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
    })

    expect(loadSoundPreference()).toBe('ambient')

    saveSoundPreference(true)
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('ambient')

    saveSoundPreference(false)
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('off')

    vi.unstubAllGlobals()
  })

  it('handles throwing localStorage gracefully without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage access denied')
      },
      setItem: () => {
        throw new Error('Storage quota exceeded')
      },
    })

    expect(loadSoundPreference()).toBe('off')
    expect(() => saveSoundPreference('ambient')).not.toThrow()

    expect(loadSoundVolume()).toBe(0.4)
    expect(() => saveSoundVolume(0.8)).not.toThrow()

    vi.unstubAllGlobals()
  })

  it('saves and loads volume with fallback to default 0.4', () => {
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
    })

    expect(loadSoundVolume()).toBe(0.4)
    saveSoundVolume(0.75)
    expect(mockStorage[SOUND_VOLUME_STORAGE_KEY]).toBe('0.75')
    expect(loadSoundVolume()).toBe(0.75)

    vi.unstubAllGlobals()
  })
})

describe('computeAmbientParams', () => {
  const mockBundle: SiteBundle = {
    site: {
      id: 'test_site',
      name: 'Test Site',
      category: 'apollo',
      mission: 'Apollo',
      agency: 'NASA',
      country: 'USA',
      lat_deg: 0,
      lon_deg: 0,
      elevation_m: null,
      landing_date_utc: null,
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
      site_id: 'test_site',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2],
      masks: { '2': new Array(360).fill(5) }, // 5 deg horizon mask everywhere
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
      site_id: 'test_site',
      start_utc: '2026-11-14T00:00:00Z',
      step_minutes: 60,
      count: 2,
      sun: {
        az: [90, 90],
        el: [10, 10], // Sun el=10 > horizon=5 -> fully visible
      },
      earth: {
        az: [180, 180],
        el: [0, 0], // Earth el=0 < horizon=5 -> below horizon (not in view)
      },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    },
    terrain: null,
    provenance: 'real',
    synthetic: false,
    approximate: false,
  }

  it('returns silence (0 fractions) when bundle is null', () => {
    const params = computeAmbientParams(null, 2, 0)
    expect(params.sun.fraction).toBe(0)
    expect(params.earth.fraction).toBe(0)
  })

  it('computes Sun and Earth parameters based on geometry and horizon clearance', () => {
    const params = computeAmbientParams(
      mockBundle,
      2,
      new Date('2026-11-14T00:00:00Z').getTime(),
    )

    // Sun: el 10, mask 5 -> clearance 5 deg >> radius 0.25 deg -> fraction = 1
    expect(params.sun.fraction).toBe(1)
    expect(params.sun.el).toBe(10)
    expect(params.sun.az).toBe(90)

    // Earth: el 0, mask 5 -> clearance -5 deg << radius 1.0 deg -> fraction = 0
    expect(params.earth.fraction).toBe(0)
    expect(params.earth.el).toBe(0)
    expect(params.earth.az).toBe(180)
  })
})

describe('createSoundEngine with mocked Web Audio graph', () => {
  beforeEach(() => {
    resetSoundEngine()
  })

  afterEach(() => {
    resetSoundEngine()
    vi.unstubAllGlobals()
  })

  it('constructs audio graph on enable, ramps parameters on change, stops on disable and unmount', () => {
    const oscInstances: Array<{
      type: string
      frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
      detune?: { setValueAtTime: ReturnType<typeof vi.fn> }
      connect: ReturnType<typeof vi.fn>
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    const gainInstances: Array<{
      gain: {
        setValueAtTime: ReturnType<typeof vi.fn>
        setTargetAtTime: ReturnType<typeof vi.fn>
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
      }
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    const filterInstances: Array<{
      type: string
      frequency: {
        setValueAtTime: ReturnType<typeof vi.fn>
        setTargetAtTime: ReturnType<typeof vi.fn>
      }
      Q: { setValueAtTime: ReturnType<typeof vi.fn> }
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    const pannerInstances: Array<{
      pan: {
        setValueAtTime: ReturnType<typeof vi.fn>
        setTargetAtTime: ReturnType<typeof vi.fn>
      }
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    const compressorInstances: Array<{
      threshold: { setValueAtTime: ReturnType<typeof vi.fn> }
      knee: { setValueAtTime: ReturnType<typeof vi.fn> }
      ratio: { setValueAtTime: ReturnType<typeof vi.fn> }
      attack: { setValueAtTime: ReturnType<typeof vi.fn> }
      release: { setValueAtTime: ReturnType<typeof vi.fn> }
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    class MockAudioContext {
      state = 'running'
      currentTime = 10
      sampleRate = 44100
      destination = {}

      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn() },
          detune: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
        }
        oscInstances.push(osc)
        return osc
      }

      createGain() {
        const g = {
          gain: {
            setValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        gainInstances.push(g)
        return g
      }

      createBiquadFilter() {
        const f = {
          type: 'lowpass',
          frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
          Q: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        filterInstances.push(f)
        return f
      }

      createStereoPanner() {
        const p = {
          pan: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        pannerInstances.push(p)
        return p
      }

      createDynamicsCompressor() {
        const c = {
          threshold: { setValueAtTime: vi.fn() },
          knee: { setValueAtTime: vi.fn() },
          ratio: { setValueAtTime: vi.fn() },
          attack: { setValueAtTime: vi.fn() },
          release: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        compressorInstances.push(c)
        return c
      }

      createBuffer(_channels: number, length: number, _rate: number) {
        return {
          getChannelData: () => new Float32Array(length),
        }
      }

      createBufferSource() {
        const s = {
          buffer: null,
          loop: false,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
        }
        return s
      }

      resume = vi.fn().mockResolvedValue(undefined)
      suspend = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
    }

    vi.stubGlobal('window', { AudioContext: MockAudioContext })

    const engine = createSoundEngine()
    expect(engine.getMode()).toBe('off')
    expect(engine.isEnabled()).toBe(false)

    // 1. Enable Ambient mode -> graph is created
    engine.setMode('ambient')
    expect(engine.getMode()).toBe('ambient')
    expect(engine.isEnabled()).toBe(true)

    // Verify DynamicsCompressor soft limiter created and configured
    expect(compressorInstances.length).toBe(1)
    expect(compressorInstances[0].threshold.setValueAtTime).toHaveBeenCalledWith(
      -6,
      10,
    )

    // Verify oscillators created (Sun: 3 osc + 1 LFO; Earth: 3 osc)
    expect(oscInstances.length).toBeGreaterThanOrEqual(7)
    for (const osc of oscInstances) {
      expect(osc.start).toHaveBeenCalled()
    }

    // Verify Sun and Earth oscillator frequencies
    const frequencies = oscInstances
      .flatMap((o) => o.frequency.setValueAtTime.mock.calls)
      .map((call) => call[0])
    expect(frequencies).toContain(880) // Sun osc 1
    expect(frequencies).toContain(1319) // Sun osc 2
    expect(frequencies).toContain(1760) // Sun osc 3
    expect(frequencies).toContain(330) // Earth osc 1
    expect(frequencies).toContain(494) // Earth osc 2
    expect(frequencies).toContain(660) // Earth osc 3 (octave partial)

    // Verify noise filter is bandpass centered near 1200 Hz
    const noiseFilterInstance = filterInstances.find((f) => f.type === 'bandpass')
    expect(noiseFilterInstance).toBeDefined()
    expect(noiseFilterInstance!.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 10)

    // Clear calls from graph setup (e.g. masterGain volume ramp)
    for (const g of gainInstances) {
      g.gain.setTargetAtTime.mockClear()
    }

    // 2. Ambient update when not playing: gain target is 0 (silence)
    engine.updateAmbient({
      sun: { fraction: 0.8, el: 25, az: 90 },
      earth: { fraction: 1.0, litFraction: 0.5, el: 15, az: 270 },
    })

    const targetAtTimeCallsNotPlaying = gainInstances.flatMap(
      (g) => g.gain.setTargetAtTime.mock.calls,
    )
    expect(targetAtTimeCallsNotPlaying.length).toBeGreaterThan(0)
    // All voice gain targets must be 0 when not playing, with fade time constant ~0.6 s
    for (const call of targetAtTimeCallsNotPlaying) {
      expect(call[0]).toBe(0)
      expect(call[2]).toBe(0.6)
    }

    // Reset recorded calls to isolate play state test
    for (const g of gainInstances) {
      g.gain.setTargetAtTime.mockClear()
    }

    // 3. Play starts: voices fade in smoothly with time constant ~0.35 s
    engine.setPlaying(true)
    expect(engine.isPlaying()).toBe(true)

    const targetAtTimeCallsPlaying = gainInstances.flatMap(
      (g) => g.gain.setTargetAtTime.mock.calls,
    )
    expect(targetAtTimeCallsPlaying.length).toBeGreaterThan(0)

    // Verify Sun voice ramp to non-zero target with time constant 0.35 s
    const sunVoiceCall = targetAtTimeCallsPlaying.find(
      (call) => Math.abs(call[0] - 0.35 * fractionToGain(0.8)) < 0.001,
    )
    expect(sunVoiceCall).toBeDefined()
    expect(sunVoiceCall![2]).toBe(0.35)

    // Verify Earth voice ramp to non-zero target with time constant 0.35 s
    const earthVoiceCall = targetAtTimeCallsPlaying.find(
      (call) => Math.abs(call[0] - 0.3 * fractionToGain(1.0)) < 0.001,
    )
    expect(earthVoiceCall).toBeDefined()
    expect(earthVoiceCall![2]).toBe(0.35)

    // Verify Earth noise breath ramp to non-zero target with time constant 0.35 s
    const noiseBreathCall = targetAtTimeCallsPlaying.find(
      (call) => Math.abs(call[0] - 0.03 * fractionToGain(1.0)) < 0.001,
    )
    expect(noiseBreathCall).toBeDefined()
    expect(noiseBreathCall![2]).toBe(0.35)

    // Verify filter frequency ramps smoothly
    const filterRampCalls = filterInstances.flatMap(
      (f) => f.frequency.setTargetAtTime.mock.calls,
    )
    expect(filterRampCalls.length).toBeGreaterThan(0)

    // Verify stereo panner ramps smoothly
    const panRampCalls = pannerInstances.flatMap(
      (p) => p.pan.setTargetAtTime.mock.calls,
    )
    expect(panRampCalls.length).toBeGreaterThan(0)

    // 4. Residual check at fraction 0: bodies below horizon have 0 gain even while playing
    for (const g of gainInstances) {
      g.gain.setTargetAtTime.mockClear()
    }
    engine.updateAmbient({
      sun: { fraction: 0, el: -10, az: 0 },
      earth: { fraction: 0, litFraction: 0, el: -10, az: 0 },
    })
    const callsAtFractionZero = gainInstances.flatMap(
      (g) => g.gain.setTargetAtTime.mock.calls,
    )
    for (const call of callsAtFractionZero) {
      expect(call[0]).toBe(0)
    }

    // 5. Play stops: voices fade to true silence (target 0, time constant ~0.6 s)
    engine.updateAmbient({
      sun: { fraction: 1.0, el: 25, az: 90 },
      earth: { fraction: 1.0, litFraction: 0.5, el: 15, az: 270 },
    })
    for (const g of gainInstances) {
      g.gain.setTargetAtTime.mockClear()
    }
    engine.setPlaying(false)
    expect(engine.isPlaying()).toBe(false)
    const callsOnPause = gainInstances.flatMap(
      (g) => g.gain.setTargetAtTime.mock.calls,
    )
    for (const call of callsOnPause) {
      expect(call[0]).toBe(0)
      expect(call[2]).toBe(0.6)
    }

    // 6. Manual scrub swell: plays a short swell while scrubbing, then fades out after ~1s
    vi.useFakeTimers()
    for (const g of gainInstances) {
      g.gain.setTargetAtTime.mockClear()
    }
    engine.triggerScrubSwell()
    const callsOnScrub = gainInstances.flatMap(
      (g) => g.gain.setTargetAtTime.mock.calls,
    )
    const sunScrubCall = callsOnScrub.find(
      (call) => Math.abs(call[0] - 0.35 * fractionToGain(1.0)) < 0.001,
    )
    expect(sunScrubCall).toBeDefined()
    expect(sunScrubCall![2]).toBe(0.35)

    // Advance 1s after last change -> fades to 0 over 0.6 s
    for (const g of gainInstances) {
      g.gain.setTargetAtTime.mockClear()
    }
    vi.advanceTimersByTime(1000)
    const callsAfterScrubTimeout = gainInstances.flatMap(
      (g) => g.gain.setTargetAtTime.mock.calls,
    )
    for (const call of callsAfterScrubTimeout) {
      expect(call[0]).toBe(0)
      expect(call[2]).toBe(0.6)
    }
    vi.useRealTimers()

    // 7. Disable / Dispose -> teardown all nodes
    engine.dispose()
    expect(engine.getMode()).toBe('off')

    // Oscillators stopped and disconnected
    for (const osc of oscInstances) {
      expect(osc.stop).toHaveBeenCalled()
      expect(osc.disconnect).toHaveBeenCalled()
    }
  })
})
