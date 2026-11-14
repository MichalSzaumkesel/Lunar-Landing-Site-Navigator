// Held-arrow-key motion: frame-based velocity integration, independent of the OS key-repeat rate.

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'

const ARROWS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

/** Time constants of the exponential approach (about 95 % after 3x): ease in ~150 ms, ease out ~200 ms. */
export const TAU_IN_S = 0.05
export const TAU_OUT_S = 0.2 / 3
/** Longest frame step we integrate, so a stalled tab does not teleport. */
export const MAX_DT_S = 0.05
/** Speed below which the motion counts as stopped. */
const STOP_EPS = 1e-3

export interface Vec2 {
  x: number
  y: number
}

export interface Modifiers {
  shift: boolean
  alt: boolean
}

export function isArrowKey(key: string): key is ArrowKey {
  return ARROWS.includes(key)
}

/** Adds or removes a key. Returns true when the set changed. */
export function applyKey(held: Set<string>, key: string, down: boolean): boolean {
  if (!isArrowKey(key)) return false
  if (down === held.has(key)) return false
  if (down) held.add(key)
  else held.delete(key)
  return true
}

/** Direction from the held keys: x right-positive, y up-positive, diagonals normalised to length 1. */
export function inputAxis(held: ReadonlySet<string>): Vec2 {
  const x = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)
  const y = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0)
  const len = Math.hypot(x, y)
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len }
}

/** Speed multiplier: Shift faster, Alt finer. */
export function speedScale(m: Modifiers): number {
  if (m.shift && !m.alt) return 3
  if (m.alt && !m.shift) return 0.25
  return 1
}

/** One damped velocity step towards `target`. Exact for any dt, so splitting a step changes nothing. */
export function stepVelocity(v: Vec2, target: Vec2, dt: number): Vec2 {
  const accelerating = target.x !== 0 || target.y !== 0
  const k = 1 - Math.exp(-Math.min(Math.max(dt, 0), MAX_DT_S) / (accelerating ? TAU_IN_S : TAU_OUT_S))
  return { x: v.x + (target.x - v.x) * k, y: v.y + (target.y - v.y) * k }
}

export interface KeyMotionOptions {
  /** Top speed in units per second for the unmodified key. */
  speed: number
  /** Called every frame while moving with the displacement for that frame (x right, y up). */
  onMove: (dx: number, dy: number, dt: number) => void
  /** Called when a key goes down while idle. */
  onStart?: () => void
  /** Called once when the motion has fully stopped. */
  onStop?: () => void
  /** Reduced motion: no easing, the velocity jumps straight to the target. */
  reducedMotion?: () => boolean
  now?: () => number
  raf?: (cb: (t: number) => void) => number
  caf?: (id: number) => void
}

export interface KeyMotion {
  /** Feed a keydown or keyup. Returns true when it is an arrow key (the caller should preventDefault). */
  handleKey(e: { key: string; shiftKey: boolean; altKey: boolean }, down: boolean): boolean
  /** Drop all held keys (blur, unmount); the motion eases out. */
  release(): void
  /** Drop all keys and stop at once without calling onStop. */
  dispose(): void
  readonly active: boolean
}

export function createKeyMotion(o: KeyMotionOptions): KeyMotion {
  const now = o.now ?? (() => performance.now())
  const raf = o.raf ?? ((cb) => requestAnimationFrame(cb))
  const caf = o.caf ?? ((id) => cancelAnimationFrame(id))
  const held = new Set<string>()
  const mods: Modifiers = { shift: false, alt: false }
  let v: Vec2 = { x: 0, y: 0 }
  let id = 0
  let last = 0

  const tick = (t: number) => {
    id = 0
    const dt = Math.min(Math.max((t - last) / 1000, 0), MAX_DT_S)
    last = t
    const axis = inputAxis(held)
    const s = o.speed * speedScale(mods)
    const target = { x: axis.x * s, y: axis.y * s }
    v = o.reducedMotion?.() ? target : stepVelocity(v, target, dt)
    if (dt > 0 && (v.x !== 0 || v.y !== 0)) o.onMove(v.x * dt, v.y * dt, dt)
    if (held.size === 0 && Math.hypot(v.x, v.y) < STOP_EPS * o.speed) {
      v = { x: 0, y: 0 }
      o.onStop?.()
      return
    }
    id = raf(tick)
  }

  const start = () => {
    if (id) return
    last = now()
    o.onStart?.()
    id = raf(tick)
  }

  return {
    handleKey(e, down) {
      if (!isArrowKey(e.key)) return false
      mods.shift = e.shiftKey
      mods.alt = e.altKey
      applyKey(held, e.key, down)
      if (down) start()
      return true
    },
    release() {
      held.clear()
    },
    dispose() {
      held.clear()
      v = { x: 0, y: 0 }
      if (id) caf(id)
      id = 0
    },
    get active() {
      return id !== 0
    },
  }
}
