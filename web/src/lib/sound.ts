import type { SkyEvent, SkyEventKind } from './events'

export interface CueNote {
  frequency: number
  startOffset: number
  duration: number
}

export interface SoundEngine {
  enable(): void
  disable(): void
  isEnabled(): boolean
  cue(kind: SkyEventKind): void
  addListener(listener: (enabled: boolean) => void): () => void
}

export const SOUND_STORAGE_KEY = 'lunar.sound'

/**
 * Pure helper returning synthesized note sequence for each event kind.
 * Sunset: two falling sine notes (440 Hz then 330 Hz, 0.18 s each)
 * Sunrise: two rising sine notes (330 Hz then 440 Hz, 0.18 s each)
 * Earth set: one low soft tone (261 Hz, 0.3 s)
 * Earth rise: one higher tone (392 Hz, 0.3 s)
 */
export function cuePlan(kind: SkyEventKind): CueNote[] {
  switch (kind) {
    case 'sunset':
      return [
        { frequency: 440, startOffset: 0, duration: 0.18 },
        { frequency: 330, startOffset: 0.18, duration: 0.18 },
      ]
    case 'sunrise':
      return [
        { frequency: 330, startOffset: 0, duration: 0.18 },
        { frequency: 440, startOffset: 0.18, duration: 0.18 },
      ]
    case 'earthset':
      return [{ frequency: 261, startOffset: 0, duration: 0.3 }]
    case 'earthrise':
      return [{ frequency: 392, startOffset: 0, duration: 0.3 }]
  }
}

/** Pure helper checking if enough time has elapsed since the last cue (min 350 ms). */
export function shouldPlayCue(
  nowMs: number,
  lastCueMs: number,
  minIntervalMs = 350,
): boolean {
  return nowMs - lastCueMs >= minIntervalMs
}

/**
 * Pure helper selecting sky events occurring strictly between prevMs and currMs.
 * Skips cues when speed is above 72 h/s or when cursor jumped backwards or by > 12 h (manual seek).
 */
export function findEventsBetween(
  events: SkyEvent[],
  prevMs: number,
  currMs: number,
  speedHPerSec: number,
  maxSpeedHPerSec = 72,
  maxJumpHours = 12,
): SkyEvent[] {
  if (speedHPerSec > maxSpeedHPerSec) {
    return []
  }
  if (currMs < prevMs) {
    return []
  }
  const maxJumpMs = maxJumpHours * 3600 * 1000
  if (currMs - prevMs > maxJumpMs) {
    return []
  }
  return events.filter((e) => e.ms > prevMs && e.ms <= currMs)
}

/** Safely reads sound on/off preference from localStorage. Defaults to false. */
export function loadSoundPreference(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(SOUND_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Safely stores sound on/off preference in localStorage. */
export function saveSoundPreference(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Silently ignore when localStorage is unavailable or blocked
  }
}

/**
 * Creates a synthesized sound engine using the Web Audio API.
 * AudioContext is created lazily on enable() from a user gesture.
 * Never throws if AudioContext is unavailable or disabled.
 */
export function createSoundEngine(): SoundEngine {
  let enabled = false
  let ctx: AudioContext | null = null
  let lastCueTime = -Infinity
  const listeners = new Set<(enabled: boolean) => void>()

  function enable(): void {
    enabled = true
    if (!ctx && typeof window !== 'undefined') {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        if (AudioContextClass) {
          ctx = new AudioContextClass()
        }
      } catch {
        ctx = null
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
    listeners.forEach((fn) => fn(true))
  }

  function disable(): void {
    enabled = false
    listeners.forEach((fn) => fn(false))
  }

  function isEnabled(): boolean {
    return enabled
  }

  function cue(kind: SkyEventKind): void {
    if (!enabled) return

    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (!shouldPlayCue(now, lastCueTime, 350)) {
      return
    }
    lastCueTime = now

    if (!ctx) return
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    try {
      const notes = cuePlan(kind)
      const baseTime = ctx.currentTime

      for (const note of notes) {
        const startTime = baseTime + note.startOffset
        const stopTime = startTime + note.duration
        const attackEndTime = startTime + 0.02 // 20 ms attack

        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()
        const masterGain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(note.frequency, startTime)

        masterGain.gain.setValueAtTime(0.08, startTime)

        // 20 ms attack and exponential decay
        noteGain.gain.setValueAtTime(0.0001, startTime)
        noteGain.gain.exponentialRampToValueAtTime(1.0, attackEndTime)
        noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime)

        osc.connect(noteGain)
        noteGain.connect(masterGain)
        masterGain.connect(ctx.destination)

        osc.start(startTime)
        osc.stop(stopTime)
      }
    } catch {
      // Must not throw when AudioContext is unavailable or errors
    }
  }

  function addListener(listener: (enabled: boolean) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    enable,
    disable,
    isEnabled,
    cue,
    addListener,
  }
}

let defaultEngine: SoundEngine | null = null

/** Returns the shared SoundEngine singleton instance. */
export function getSoundEngine(): SoundEngine {
  if (!defaultEngine) {
    defaultEngine = createSoundEngine()
  }
  return defaultEngine
}
