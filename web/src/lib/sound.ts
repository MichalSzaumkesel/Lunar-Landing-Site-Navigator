import type { SkyEvent, SkyEventKind } from './events'
import type { SiteBundle } from './types'
import { pickMaskFor, bodyFraction } from './metrics'
import { horizonAt } from './horizon'
import { sampleAt } from './ephem'
import { earthIlluminatedFraction } from './earthPhase'

export interface CueNote {
  frequency: number
  startOffset: number
  duration: number
}

export type SoundMode = 'off' | 'ambient' | 'cues'

export interface AmbientBodyParams {
  fraction: number
  el: number
  az: number
}

export interface AmbientEarthParams {
  fraction: number
  litFraction: number
  el: number
  az: number
}

export interface AmbientParams {
  sun: AmbientBodyParams
  earth: AmbientEarthParams
}

export interface SoundEngine {
  enable(mode?: SoundMode): void
  disable(): void
  isEnabled(): boolean
  getMode(): SoundMode
  setMode(mode: SoundMode): void
  getVolume(): number
  setVolume(volume: number): void
  cue(kind: SkyEventKind): void
  updateAmbient(params: AmbientParams): void
  addListener(listener: (mode: SoundMode) => void): () => void
  dispose(): void
}

export const SOUND_STORAGE_KEY = 'lunar.sound'
export const SOUND_VOLUME_STORAGE_KEY = 'lunar.sound.volume'

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

/**
 * Smooth curve mapping disc fraction [0, 1] to perceptual gain.
 * Quadratic curve (fraction^2) makes a half-cut disc (0.5) clearly quieter (0.25, -12 dB),
 * with 0 fading to true silence.
 */
export function fractionToGain(fraction: number): number {
  if (fraction <= 0) return 0
  if (fraction >= 1) return 1
  return fraction * fraction
}

/**
 * Maps Sun elevation (degrees) to low-pass filter cutoff frequency in Hz.
 * Below horizon or at horizon (el <= 0): bright base cutoff (1800 Hz).
 * Higher elevation opens the filter up to 5000 Hz (brighter when higher).
 */
export function elevationToFilterCutoff(elevationDeg: number): number {
  const baseCutoff = 1800
  const maxCutoff = 5000
  if (elevationDeg <= 0) return baseCutoff
  const factor = Math.min(1, elevationDeg / 60)
  return baseCutoff + factor * (maxCutoff - baseCutoff)
}

/**
 * Maps Earth lit fraction [0, 1] to low-pass filter cutoff frequency in Hz.
 * A dark crescent is darker (250 Hz), full Earth is fuller (900 Hz); the Earth voice is deliberately LOW and the Sun voice HIGH so the two are easy to tell apart.
 */
export function earthLitFractionToBrightness(litFraction: number): number {
  const minCutoff = 250
  const maxCutoff = 900
  const clamped = Math.max(0, Math.min(1, litFraction))
  return minCutoff + clamped * (maxCutoff - minCutoff)
}

/**
 * Maps azimuth in degrees to stereo pan in [-1, 1] (north centre, east right).
 * pan = sin(azimuth). Wraps naturally and handles negative degrees.
 */
export function azimuthToPan(azimuthDeg: number): number {
  const rad = (azimuthDeg * Math.PI) / 180
  const pan = Math.sin(rad)
  if (Math.abs(pan) < 1e-6) return 0
  return Math.max(-1, Math.min(1, Math.round(pan * 100000) / 100000))
}

/**
 * Rate limiter: limits ambient parameter updates to ~15 per second (min interval ~66.7 ms).
 */
export function shouldUpdateAmbient(
  nowMs: number,
  lastUpdateMs: number,
  minIntervalMs = 1000 / 15,
): boolean {
  return nowMs - lastUpdateMs >= minIntervalMs
}

/** Safely reads sound mode preference from localStorage. Defaults to 'off'. */
export function loadSoundPreference(): SoundMode {
  try {
    if (typeof localStorage === 'undefined') return 'off'
    const val = localStorage.getItem(SOUND_STORAGE_KEY)
    if (val === 'ambient' || val === 'cues' || val === 'off') {
      return val
    }
    // Backward compatibility with previous boolean storage:
    if (val === 'true') return 'ambient'
    return 'off'
  } catch {
    return 'off'
  }
}

/** Safely stores sound mode preference in localStorage. */
export function saveSoundPreference(mode: SoundMode | boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    const str = typeof mode === 'boolean' ? (mode ? 'ambient' : 'off') : mode
    localStorage.setItem(SOUND_STORAGE_KEY, str)
  } catch {
    // Silently ignore when localStorage is unavailable or blocked
  }
}

/** Safely reads sound volume from localStorage (0..1). Defaults to 0.4 (40%). */
export function loadSoundVolume(): number {
  try {
    if (typeof localStorage === 'undefined') return 0.4
    const val = localStorage.getItem(SOUND_VOLUME_STORAGE_KEY)
    if (val === null) return 0.4
    const parsed = Number(val)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed
    }
    return 0.4
  } catch {
    return 0.4
  }
}

/** Safely stores sound volume in localStorage (0..1). */
export function saveSoundVolume(volume: number): void {
  try {
    if (typeof localStorage === 'undefined') return
    const clamped = Math.max(0, Math.min(1, volume))
    localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(clamped))
  } catch {
    // Silently ignore when localStorage is unavailable or blocked
  }
}

/** Pure helper computing Sun and Earth ambient parameters from bundle data at a cursor timestamp. */
export function computeAmbientParams(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'> | null | undefined,
  observerHeightM: number,
  cursorMs: number,
): AmbientParams {
  if (!bundle || !bundle.ephem || !bundle.horizon) {
    return {
      sun: { fraction: 0, el: 0, az: 0 },
      earth: { fraction: 0, litFraction: 0, el: 0, az: 0 },
    }
  }

  const sample = sampleAt(bundle.ephem, cursorMs)
  if (!sample) {
    return {
      sun: { fraction: 0, el: 0, az: 0 },
      earth: { fraction: 0, litFraction: 0, el: 0, az: 0 },
    }
  }

  const mask = pickMaskFor(bundle.horizon, observerHeightM)
  const azStepDeg = bundle.horizon.az_step_deg

  const sunHorizonEl = horizonAt(mask, azStepDeg, sample.sun.az)
  const sunClearance = sample.sun.el - sunHorizonEl
  const sunFraction = bodyFraction(sunClearance, bundle.ephem.sun_ang_radius_deg)

  const earthHorizonEl = horizonAt(mask, azStepDeg, sample.earth.az)
  const earthClearance = sample.earth.el - earthHorizonEl
  const earthFraction = bodyFraction(earthClearance, bundle.ephem.earth_ang_radius_deg)
  const earthLitFraction = earthIlluminatedFraction(sample.sun, sample.earth)

  return {
    sun: {
      fraction: sunFraction,
      el: sample.sun.el,
      az: sample.sun.az,
    },
    earth: {
      fraction: earthFraction,
      litFraction: earthLitFraction,
      el: sample.earth.el,
      az: sample.earth.az,
    },
  }
}

interface AmbientNodes {
  sunOsc1: OscillatorNode
  sunOsc2: OscillatorNode
  sunOsc3: OscillatorNode
  sunFilter: BiquadFilterNode
  sunTremolo: GainNode
  sunLfo: OscillatorNode
  sunLfoGain: GainNode
  sunGain: GainNode
  sunPanner: StereoPannerNode | GainNode
  earthOsc1: OscillatorNode
  earthOsc2: OscillatorNode
  noiseSource: AudioBufferSourceNode
  noiseFilter: BiquadFilterNode
  noiseGain: GainNode
  earthGain: GainNode
  earthFilter: BiquadFilterNode
  earthPanner: StereoPannerNode | GainNode
}

/**
 * Creates a synthesized sound engine using the Web Audio API.
 * AudioContext is created lazily on enable() or setMode() from a user gesture.
 * Provides continuous ambient sound for Sun & Earth visibility, plus event cues.
 * Never throws if AudioContext is unavailable or disabled.
 */
export function createSoundEngine(): SoundEngine {
  let mode: SoundMode = 'off'
  let volume = loadSoundVolume()
  let ctx: AudioContext | null = null
  let masterGain: GainNode | null = null
  let compressor: DynamicsCompressorNode | null = null

  let ambientNodes: AmbientNodes | null = null
  let fadeTimeout: ReturnType<typeof setTimeout> | null = null
  let lastCueTime = -Infinity
  let lastAmbientUpdateMs = -Infinity
  let latestAmbientParams: AmbientParams | null = null

  const listeners = new Set<(mode: SoundMode) => void>()

  function getOrCreateContext(): AudioContext | null {
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
    return ctx
  }

  function ensureMasterGraph(c: AudioContext): void {
    if (!masterGain) {
      masterGain = c.createGain()
      // Base master gain around -20 dBFS (0.1)
      masterGain.gain.setValueAtTime(0.1 * volume, c.currentTime)
    }
    if (!compressor) {
      compressor = c.createDynamicsCompressor()
      compressor.threshold.setValueAtTime(-6, c.currentTime)
      compressor.knee.setValueAtTime(6, c.currentTime)
      compressor.ratio.setValueAtTime(12, c.currentTime)
      compressor.attack.setValueAtTime(0.003, c.currentTime)
      compressor.release.setValueAtTime(0.25, c.currentTime)
      masterGain.connect(compressor)
      compressor.connect(c.destination)
    }
  }

  function createPanner(c: AudioContext): StereoPannerNode | GainNode {
    if (typeof c.createStereoPanner === 'function') {
      return c.createStereoPanner()
    }
    return c.createGain()
  }

  function setPan(
    panner: StereoPannerNode | GainNode,
    targetPan: number,
    time: number,
  ): void {
    if ('pan' in panner && panner.pan && typeof panner.pan.setTargetAtTime === 'function') {
      panner.pan.setTargetAtTime(targetPan, time, 0.35)
    }
  }

  function setupAmbientGraph(c: AudioContext): AmbientNodes {
    ensureMasterGraph(c)
    const t = c.currentTime

    // Sun voice: 3 detuned oscillators (high register: A4=440, E5=659.25, A5=880)
    const sunOsc1 = c.createOscillator()
    sunOsc1.type = 'sine'
    sunOsc1.frequency.setValueAtTime(440, t)
    if (sunOsc1.detune) sunOsc1.detune.setValueAtTime(-4, t)

    const sunOsc2 = c.createOscillator()
    sunOsc2.type = 'triangle'
    sunOsc2.frequency.setValueAtTime(659.25, t)
    if (sunOsc2.detune) sunOsc2.detune.setValueAtTime(3, t)

    const sunOsc3 = c.createOscillator()
    sunOsc3.type = 'sine'
    sunOsc3.frequency.setValueAtTime(880, t)
    if (sunOsc3.detune) sunOsc3.detune.setValueAtTime(5, t)

    // Sun low-pass filter (brighter when higher)
    const sunFilter = c.createBiquadFilter()
    sunFilter.type = 'lowpass'
    sunFilter.frequency.setValueAtTime(1800, t)
    sunFilter.Q.setValueAtTime(1.0, t)

    // Sun tremolo: slow LFO modulates gain when disc fraction is partial
    const sunTremolo = c.createGain()
    sunTremolo.gain.setValueAtTime(1.0, t)

    const sunLfo = c.createOscillator()
    sunLfo.type = 'sine'
    sunLfo.frequency.setValueAtTime(2.8, t)

    const sunLfoGain = c.createGain()
    sunLfoGain.gain.setValueAtTime(0, t)
    sunLfo.connect(sunLfoGain)
    sunLfoGain.connect(sunTremolo.gain)

    const sunGain = c.createGain()
    sunGain.gain.setValueAtTime(0.0001, t)

    const sunPanner = createPanner(c)

    sunOsc1.connect(sunFilter)
    sunOsc2.connect(sunFilter)
    sunOsc3.connect(sunFilter)
    sunFilter.connect(sunTremolo)
    sunTremolo.connect(sunGain)
    sunGain.connect(sunPanner)
    sunPanner.connect(masterGain!)

    // Earth voice, low register: A2 (110 Hz), E3 (~164.81 Hz), plus band-passed noise breath
    const earthOsc1 = c.createOscillator()
    earthOsc1.type = 'sine'
    earthOsc1.frequency.setValueAtTime(110, t)

    const earthOsc2 = c.createOscillator()
    earthOsc2.type = 'sine'
    earthOsc2.frequency.setValueAtTime(164.81, t)

    // Noise breath
    const bufferSize = Math.max(1, Math.floor(c.sampleRate * 2))
    const noiseBuffer = c.createBuffer(1, bufferSize, c.sampleRate)
    const channelData = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2 - 1
    }
    const noiseSource = c.createBufferSource()
    noiseSource.buffer = noiseBuffer
    noiseSource.loop = true

    const noiseFilter = c.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.setValueAtTime(300, t)
    noiseFilter.Q.setValueAtTime(2.0, t)

    const noiseGain = c.createGain()
    noiseGain.gain.setValueAtTime(0.03, t)

    noiseSource.connect(noiseFilter)
    noiseFilter.connect(noiseGain)

    const earthGain = c.createGain()
    earthGain.gain.setValueAtTime(0.0001, t)

    const earthFilter = c.createBiquadFilter()
    earthFilter.type = 'lowpass'
    earthFilter.frequency.setValueAtTime(500, t)
    earthFilter.Q.setValueAtTime(1.0, t)

    const earthPanner = createPanner(c)

    earthOsc1.connect(earthGain)
    earthOsc2.connect(earthGain)
    noiseGain.connect(earthGain)
    earthGain.connect(earthFilter)
    earthFilter.connect(earthPanner)
    earthPanner.connect(masterGain!)

    // Start all sound generators
    sunOsc1.start(t)
    sunOsc2.start(t)
    sunOsc3.start(t)
    sunLfo.start(t)
    earthOsc1.start(t)
    earthOsc2.start(t)
    noiseSource.start(t)

    return {
      sunOsc1,
      sunOsc2,
      sunOsc3,
      sunFilter,
      sunTremolo,
      sunLfo,
      sunLfoGain,
      sunGain,
      sunPanner,
      earthOsc1,
      earthOsc2,
      noiseSource,
      noiseFilter,
      noiseGain,
      earthGain,
      earthFilter,
      earthPanner,
    }
  }

  function teardownAmbientGraph(immediate = false): void {
    if (!ambientNodes) return
    const nodes = ambientNodes
    ambientNodes = null

    if (ctx && !immediate) {
      try {
        const t = ctx.currentTime
        nodes.sunGain.gain.setTargetAtTime(0.0001, t, 0.15)
        nodes.earthGain.gain.setTargetAtTime(0.0001, t, 0.15)
      } catch {
        // Ignore
      }
    }

    const cleanup = (): void => {
      try { nodes.sunOsc1.stop() } catch {}
      try { nodes.sunOsc2.stop() } catch {}
      try { nodes.sunOsc3.stop() } catch {}
      try { nodes.sunLfo.stop() } catch {}
      try { nodes.earthOsc1.stop() } catch {}
      try { nodes.earthOsc2.stop() } catch {}
      try { nodes.noiseSource.stop() } catch {}

      try { nodes.sunOsc1.disconnect() } catch {}
      try { nodes.sunOsc2.disconnect() } catch {}
      try { nodes.sunOsc3.disconnect() } catch {}
      try { nodes.sunFilter.disconnect() } catch {}
      try { nodes.sunTremolo.disconnect() } catch {}
      try { nodes.sunLfo.disconnect() } catch {}
      try { nodes.sunLfoGain.disconnect() } catch {}
      try { nodes.sunGain.disconnect() } catch {}
      try { nodes.sunPanner.disconnect() } catch {}

      try { nodes.earthOsc1.disconnect() } catch {}
      try { nodes.earthOsc2.disconnect() } catch {}
      try { nodes.noiseSource.disconnect() } catch {}
      try { nodes.noiseFilter.disconnect() } catch {}
      try { nodes.noiseGain.disconnect() } catch {}
      try { nodes.earthGain.disconnect() } catch {}
      try { nodes.earthFilter.disconnect() } catch {}
      try { nodes.earthPanner.disconnect() } catch {}
    }

    if (immediate) {
      cleanup()
    } else {
      setTimeout(cleanup, 600)
    }
  }

  function applyAmbientUpdate(params: AmbientParams): void {
    if (!ambientNodes || !ctx) return
    const t = ctx.currentTime

    // Sun voice
    const sunGainTarget = 0.35 * fractionToGain(params.sun.fraction)
    const sunFilterTarget = elevationToFilterCutoff(params.sun.el)
    const sunPanTarget = azimuthToPan(params.sun.az)
    const tremoloDepth =
      params.sun.fraction > 0 && params.sun.fraction < 1
        ? (1 - params.sun.fraction) * 0.4
        : 0

    ambientNodes.sunGain.gain.setTargetAtTime(sunGainTarget, t, 0.35)
    ambientNodes.sunFilter.frequency.setTargetAtTime(sunFilterTarget, t, 0.35)
    setPan(ambientNodes.sunPanner, sunPanTarget, t)
    ambientNodes.sunLfoGain.gain.setTargetAtTime(tremoloDepth, t, 0.35)

    // Earth voice: silent when fraction <= 0 (not in view)
    const earthGainTarget = 0.3 * fractionToGain(params.earth.fraction)
    const earthFilterTarget = earthLitFractionToBrightness(params.earth.litFraction)
    const earthPanTarget = azimuthToPan(params.earth.az)

    ambientNodes.earthGain.gain.setTargetAtTime(earthGainTarget, t, 0.35)
    ambientNodes.earthFilter.frequency.setTargetAtTime(earthFilterTarget, t, 0.35)
    setPan(ambientNodes.earthPanner, earthPanTarget, t)
  }

  function setMode(newMode: SoundMode): void {
    if (fadeTimeout) {
      clearTimeout(fadeTimeout)
      fadeTimeout = null
    }

    const prevMode = mode
    mode = newMode

    if (newMode !== 'off') {
      const c = getOrCreateContext()
      if (c) {
        ensureMasterGraph(c)
        if (c.state === 'suspended') {
          c.resume().catch(() => {})
        }
        if (masterGain) {
          masterGain.gain.setTargetAtTime(0.1 * volume, c.currentTime, 0.15)
        }
      }
    }

    if (newMode === 'ambient') {
      const c = getOrCreateContext()
      if (c && !ambientNodes) {
        ambientNodes = setupAmbientGraph(c)
        if (latestAmbientParams) {
          applyAmbientUpdate(latestAmbientParams)
        }
      }
    } else if (prevMode === 'ambient') {
      teardownAmbientGraph(false)
    }

    if (newMode === 'off') {
      if (ctx && masterGain) {
        const t = ctx.currentTime
        masterGain.gain.setTargetAtTime(0.0001, t, 0.15)
      }
      fadeTimeout = setTimeout(() => {
        if (mode === 'off' && ctx && ctx.state === 'running') {
          ctx.suspend().catch(() => {})
        }
      }, 600)
    }

    listeners.forEach((fn) => fn(mode))
  }

  function enable(m: SoundMode = 'ambient'): void {
    setMode(m === 'off' ? 'ambient' : m)
  }

  function disable(): void {
    setMode('off')
  }

  function isEnabled(): boolean {
    return mode !== 'off'
  }

  function getMode(): SoundMode {
    return mode
  }

  function setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v))
    if (ctx && masterGain && mode !== 'off') {
      masterGain.gain.setTargetAtTime(0.1 * volume, ctx.currentTime, 0.05)
    }
  }

  function getVolume(): number {
    return volume
  }

  function updateAmbient(params: AmbientParams): void {
    latestAmbientParams = params
    if (mode !== 'ambient') return

    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (!shouldUpdateAmbient(now, lastAmbientUpdateMs)) {
      return
    }
    lastAmbientUpdateMs = now

    applyAmbientUpdate(params)
  }

  function cue(kind: SkyEventKind): void {
    if (mode !== 'cues') return

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
      ensureMasterGraph(ctx)
      const notes = cuePlan(kind)
      const baseTime = ctx.currentTime

      for (const note of notes) {
        const startTime = baseTime + note.startOffset
        const stopTime = startTime + note.duration
        const attackEndTime = startTime + 0.02 // 20 ms attack

        const osc = ctx.createOscillator()
        const noteGain = ctx.createGain()

        osc.type = 'sine'
        osc.frequency.setValueAtTime(note.frequency, startTime)

        noteGain.gain.setValueAtTime(0.0001, startTime)
        noteGain.gain.exponentialRampToValueAtTime(0.8, attackEndTime)
        noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime)

        osc.connect(noteGain)
        noteGain.connect(masterGain!)

        osc.start(startTime)
        osc.stop(stopTime)
      }
    } catch {
      // Must not throw when AudioContext is unavailable or errors
    }
  }

  function addListener(listener: (mode: SoundMode) => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function handleVisibility(): void {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      if (ctx && ctx.state === 'running') {
        ctx.suspend().catch(() => {})
      }
    } else {
      if (ctx && ctx.state === 'suspended' && mode === 'ambient') {
        ctx.resume().catch(() => {})
      }
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility)
  }

  function dispose(): void {
    if (fadeTimeout) {
      clearTimeout(fadeTimeout)
      fadeTimeout = null
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    teardownAmbientGraph(true)
    if (masterGain) {
      try { masterGain.disconnect() } catch {}
      masterGain = null
    }
    if (compressor) {
      try { compressor.disconnect() } catch {}
      compressor = null
    }
    if (ctx) {
      try { ctx.close().catch(() => {}) } catch {}
      ctx = null
    }
    listeners.clear()
    mode = 'off'
  }

  return {
    enable,
    disable,
    isEnabled,
    getMode,
    setMode,
    getVolume,
    setVolume,
    cue,
    updateAmbient,
    addListener,
    dispose,
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

/** Resets the shared SoundEngine singleton (for tests). */
export function resetSoundEngine(): void {
  if (defaultEngine) {
    defaultEngine.dispose()
    defaultEngine = null
  }
}
