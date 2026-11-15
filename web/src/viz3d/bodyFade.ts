// Pure blend helpers for the Sun and Earth in the 3D sky: a body fades in and out instead of popping
// when it crosses the terrain horizon, and the size slider eases the disc scale. Only opacity and
// scale are eased here; the body direction is never touched, so Play does not make a body trail.
import { dampFactor } from './cameraLock'
import { easeInOutCubic, lerp } from './tween'

/** Time a body takes to fade fully in or out. */
export const FADE_MS = 300
/** Dead band (degrees of limb clearance) around the visibility threshold, so it cannot flicker. */
export const FADE_HYSTERESIS_DEG = 0.05
/** A fading body is drawn this much smaller at zero opacity (a slight ease, not a zoom). */
export const FADE_MIN_SCALE = 0.92
/** Time constant of the size slider ease. */
export const SIZE_TAU_MS = 80
/** Below this opacity the body is not drawn at all. */
export const FADE_OFF = 0.004

const SIZE_SNAP = 0.002

export interface BodyFx {
  /** 0..1, after easing. */
  opacity: number
  /** Multiplier of the body radius (fade scale times size slider ease). */
  scale: number
}

export const FX_FULL: BodyFx = { opacity: 1, scale: 1 }

/**
 * Whether the body counts as shown, with hysteresis. `clearanceDeg + angRadiusDeg >= 0` is the plain
 * rule (some of the disc above the horizon); a shown body hides only `hystDeg` below it and a hidden
 * one shows again only `hystDeg` above it.
 */
export function nextShown(
  prevShown: boolean,
  clearanceDeg: number,
  angRadiusDeg: number,
  hystDeg = FADE_HYSTERESIS_DEG,
): boolean {
  const margin = clearanceDeg + angRadiusDeg
  return prevShown ? margin >= -hystDeg : margin >= hystDeg
}

/** Moves the blend progress 0..1 towards its target at a constant rate (frame-rate independent). */
export function stepProgress(p: number, shown: boolean, dtMs: number, durationMs = FADE_MS): number {
  const target = shown ? 1 : 0
  if (durationMs <= 0) return target
  const step = Math.max(0, dtMs) / durationMs
  return p < target ? Math.min(target, p + step) : Math.max(target, p - step)
}

export function blendOpacity(p: number): number {
  return easeInOutCubic(p)
}

export function blendScale(p: number): number {
  return lerp(FADE_MIN_SCALE, 1, easeInOutCubic(p))
}

/** Exponential ease of the size multiplier towards its target, snapping when it is close enough. */
export function dampSize(current: number, target: number, dtMs: number, tauMs = SIZE_TAU_MS): number {
  if (Math.abs(target - current) < SIZE_SNAP) return target
  return current + (target - current) * dampFactor(dtMs, tauMs)
}

export interface BodyFade {
  shown: boolean
  /** Blend progress 0..1 (linear in time); opacity is its eased value. */
  p: number
  /** Eased size multiplier (the slider value being followed). */
  size: number
  /** False until the first retarget, which snaps instead of animating. */
  ready: boolean
}

export function createBodyFade(): BodyFade {
  return { shown: false, p: 0, size: 1, ready: false }
}

/** Sets the new goal: whether the body is shown and the size multiplier. The first call, or `instant`, snaps. */
export function retargetFade(
  f: BodyFade,
  hasDir: boolean,
  clearanceDeg: number,
  angRadiusDeg: number,
  sizeTarget: number,
  instant: boolean,
): void {
  f.shown = hasDir && (f.ready ? nextShown(f.shown, clearanceDeg, angRadiusDeg) : clearanceDeg + angRadiusDeg >= 0)
  if (!f.ready || instant) {
    f.p = f.shown ? 1 : 0
    f.size = sizeTarget
  }
  f.ready = true
}

/** One frame step. Returns true while something is still moving (the caller schedules another frame). */
export function advanceFade(f: BodyFade, dtMs: number, sizeTarget: number, instant: boolean): boolean {
  if (instant) {
    f.p = f.shown ? 1 : 0
    f.size = sizeTarget
    return false
  }
  f.p = stepProgress(f.p, f.shown, dtMs)
  f.size = dampSize(f.size, sizeTarget, dtMs)
  return f.p !== (f.shown ? 1 : 0) || f.size !== sizeTarget
}

export function fadeFx(f: BodyFade, sizeTarget: number): BodyFx {
  return { opacity: blendOpacity(f.p), scale: blendScale(f.p) * (f.size / Math.max(sizeTarget, 1e-6)) }
}
