// WASD walking on the 3D surface view: pure velocity helpers plus a frame-based motion loop.
// The loop is independent of the OS key-repeat rate and of the render frame rate.

import { MAX_DT_S, stepVelocity } from './keyMotion'
import type { Vec2 } from './keyMotion'

export type WalkKey = 'forward' | 'back' | 'left' | 'right'

/** Walking speed on the surface (metres per second) and the Shift multiplier. */
export const WALK_SPEED_MPS = 8
export const WALK_SHIFT_SCALE = 4
/** Longest frame step integrated for the position, so a stalled tab does not teleport. */
export const WALK_MAX_DT_S = 0.1
/** Speed (fraction of the top speed) below which the walk counts as stopped. */
const STOP_EPS = 1e-3

const BY_CODE: Readonly<Record<string, WalkKey>> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
}
const BY_KEY: Readonly<Record<string, WalkKey>> = { w: 'forward', s: 'back', a: 'left', d: 'right' }

/** The physical key position wins (so other layouts keep the WASD cluster); the character is the fallback. */
export function walkKeyOf(e: { key: string; code?: string }): WalkKey | null {
  if (e.code) return BY_CODE[e.code] ?? null
  return BY_KEY[e.key.toLowerCase()] ?? null
}

/** Adds or removes a key. Returns true when the set changed. */
export function applyWalkKey(held: Set<WalkKey>, key: WalkKey, down: boolean): boolean {
  if (down === held.has(key)) return false
  if (down) held.add(key)
  else held.delete(key)
  return true
}

/** Input direction: x strafe right-positive, y forward-positive, diagonals normalised to length 1. */
export function walkAxis(held: ReadonlySet<WalkKey>): Vec2 {
  const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
  const y = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0)
  const len = Math.hypot(x, y)
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len }
}

export function walkSpeedScale(shift: boolean): number {
  return shift ? WALK_SHIFT_SCALE : 1
}

/**
 * Target velocity in the local frame (x east, y north) for the held keys and a view azimuth
 * (degrees from north, clockwise). Forward is the look direction, right is 90 degrees clockwise of it.
 */
export function walkTarget(held: ReadonlySet<WalkKey>, yawDeg: number, speed: number): Vec2 {
  const a = walkAxis(held)
  const yaw = (yawDeg * Math.PI) / 180
  const s = Math.sin(yaw)
  const c = Math.cos(yaw)
  return { x: speed * (a.y * s + a.x * c), y: speed * (a.y * c - a.x * s) }
}

export interface WalkKeyEvent {
  key: string
  code?: string
  shiftKey: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], [role="radiogroup"], [role="textbox"], [role="spinbutton"]'

/** True when the focus is in something that uses letter keys itself (input, select, slider, menu). */
export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el || typeof el.closest !== 'function') return false
  return el.closest(TYPING_SELECTOR) !== null
}

/** Ctrl, Meta and Alt turn WASD into browser or app shortcuts, so they never walk. */
export function hasWalkBlockingModifier(e: Pick<WalkKeyEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return Boolean(e.ctrlKey || e.metaKey || e.altKey)
}

export interface WalkFrame {
  /** View azimuth in degrees from north, clockwise. */
  yawDeg: number
  /** Top speed in metres per second for the unmodified key. */
  speedMps: number
}

export interface WalkMotionOptions {
  /** Read every frame, so turning the view while walking changes the direction at once. */
  getFrame: () => WalkFrame
  /** Displacement of this frame in metres (east, north). */
  onMove: (dEastM: number, dNorthM: number, dt: number) => void
  /** Called when a key goes down while idle. */
  onStart?: () => void
  /** Called once when the walk has fully stopped (also after stop()). */
  onStop?: () => void
  /** Reduced motion: no easing, the velocity jumps straight to the target. */
  reducedMotion?: () => boolean
  now?: () => number
  raf?: (cb: (t: number) => void) => number
  caf?: (id: number) => void
}

export interface WalkMotion {
  /** Feed a keydown or keyup. Returns true when it is a walk key that was taken (the caller should preventDefault). */
  handleKey(e: WalkKeyEvent, down: boolean): boolean
  /** Stop at once: drop all keys, zero the velocity and call onStop (blur, hidden tab, mode switch). */
  stop(): void
  /** Like stop() but silent (unmount). */
  dispose(): void
  readonly active: boolean
}

export function createWalkMotion(o: WalkMotionOptions): WalkMotion {
  const now = o.now ?? (() => performance.now())
  const raf = o.raf ?? ((cb) => requestAnimationFrame(cb))
  const caf = o.caf ?? ((id) => cancelAnimationFrame(id))
  const held = new Set<WalkKey>()
  let shift = false
  let v: Vec2 = { x: 0, y: 0 }
  let id = 0
  let last = 0
  let running = false

  const finish = () => {
    held.clear()
    v = { x: 0, y: 0 }
    if (id) caf(id)
    id = 0
    running = false
  }

  const tick = (t: number) => {
    id = 0
    const dt = Math.min(Math.max((t - last) / 1000, 0), WALK_MAX_DT_S)
    last = t
    const f = o.getFrame()
    const target = walkTarget(held, f.yawDeg, f.speedMps * walkSpeedScale(shift))
    v = o.reducedMotion?.() ? target : stepVelocity(v, target, Math.min(dt, MAX_DT_S))
    if (dt > 0 && (v.x !== 0 || v.y !== 0)) o.onMove(v.x * dt, v.y * dt, dt)
    if (held.size === 0 && Math.hypot(v.x, v.y) < STOP_EPS * f.speedMps) {
      finish()
      o.onStop?.()
      return
    }
    id = raf(tick)
  }

  const start = () => {
    if (running) return
    running = true
    last = now()
    o.onStart?.()
    id = raf(tick)
  }

  return {
    handleKey(e, down) {
      shift = e.shiftKey
      const k = walkKeyOf(e)
      if (!k) return false
      if (!down) {
        // A key release is always honoured, whatever modifiers are down now.
        applyWalkKey(held, k, false)
        return true
      }
      if (hasWalkBlockingModifier(e)) return false
      applyWalkKey(held, k, true)
      start()
      return true
    },
    stop() {
      const wasRunning = running
      finish()
      if (wasRunning) o.onStop?.()
    },
    dispose() {
      finish()
    },
    get active() {
      return running
    },
  }
}
