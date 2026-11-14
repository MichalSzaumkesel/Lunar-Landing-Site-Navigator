import { describe, expect, it, vi } from 'vitest'
import {
  createSoundEngine,
  cuePlan,
  findEventsBetween,
  loadSoundPreference,
  saveSoundPreference,
  shouldPlayCue,
  SOUND_STORAGE_KEY,
} from './sound'
import type { SkyEvent } from './events'

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
    // Exactly 12 hours: allowed
    const exact12 = findEventsBetween(
      events,
      100_000,
      100_000 + twelveHoursMs,
      10,
    )
    expect(exact12.length).toBe(4)

    // > 12 hours: seek detected, skipped
    const jump = findEventsBetween(
      events,
      100_000,
      100_000 + twelveHoursMs + 1,
      10,
    )
    expect(jump).toEqual([])
  })
})

describe('sound preference persistence', () => {
  it('defaults to false when localStorage is empty', () => {
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
    })

    expect(loadSoundPreference()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('saves and loads preference correctly', () => {
    const mockStorage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val
      },
    })

    saveSoundPreference(true)
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('true')
    expect(loadSoundPreference()).toBe(true)

    saveSoundPreference(false)
    expect(mockStorage[SOUND_STORAGE_KEY]).toBe('false')
    expect(loadSoundPreference()).toBe(false)

    vi.unstubAllGlobals()
  })

  it('handles localStorage errors gracefully without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage disabled')
      },
      setItem: () => {
        throw new Error('Storage quota exceeded')
      },
    })

    expect(loadSoundPreference()).toBe(false)
    expect(() => saveSoundPreference(true)).not.toThrow()

    vi.unstubAllGlobals()
  })
})

describe('createSoundEngine', () => {
  it('creates an engine that starts disabled and toggles state cleanly', () => {
    const engine = createSoundEngine()
    expect(engine.isEnabled()).toBe(false)

    const listener = vi.fn()
    const unsub = engine.addListener(listener)

    engine.enable()
    expect(engine.isEnabled()).toBe(true)
    expect(listener).toHaveBeenCalledWith(true)

    engine.disable()
    expect(engine.isEnabled()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)

    unsub()
    engine.enable()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('cues safely when AudioContext is unavailable without throwing', () => {
    const engine = createSoundEngine()
    engine.enable()
    expect(() => engine.cue('sunset')).not.toThrow()
    expect(() => engine.cue('sunrise')).not.toThrow()
    expect(() => engine.cue('earthset')).not.toThrow()
    expect(() => engine.cue('earthrise')).not.toThrow()
  })

  it('synthesizes tones using AudioContext when available', () => {
    const startMock = vi.fn()
    const stopMock = vi.fn()
    const oscSetValMock = vi.fn()
    const gainSetValMock = vi.fn()
    const expRampMock = vi.fn()

    const mockOsc = {
      type: 'sine',
      frequency: { setValueAtTime: oscSetValMock },
      connect: vi.fn(),
      start: startMock,
      stop: stopMock,
    }

    const mockGain = {
      gain: {
        setValueAtTime: gainSetValMock,
        exponentialRampToValueAtTime: expRampMock,
      },
      connect: vi.fn(),
    }

    class MockAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      createOscillator() {
        return mockOsc
      }
      createGain() {
        return mockGain
      }
      resume = vi.fn().mockResolvedValue(undefined)
    }

    vi.stubGlobal('window', { AudioContext: MockAudioContext })

    const engine = createSoundEngine()
    engine.enable()
    engine.cue('sunset')

    // Sunset has 2 notes -> 2 oscillators created and started
    expect(startMock).toHaveBeenCalledTimes(2)
    expect(stopMock).toHaveBeenCalledTimes(2)
    expect(oscSetValMock).toHaveBeenCalledWith(440, 0)
    expect(oscSetValMock).toHaveBeenCalledWith(330, 0.18)

    vi.unstubAllGlobals()
  })
})
