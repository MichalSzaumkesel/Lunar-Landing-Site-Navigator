// Pure tween helpers for 3D view moves: easing, interpolation and a cancellable frame driver.

export interface Offset2 {
  eastM: number
  northM: number
}

/** Moves of the lander on a click or search result. */
export const MOVE_MS = 600

/** Ease-in-out cubic, input clamped to 0..1. */
export function easeInOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function lerpOffset(a: Offset2, b: Offset2, t: number): Offset2 {
  return { eastM: lerp(a.eastM, b.eastM, t), northM: lerp(a.northM, b.northM, t) }
}

export interface TweenOptions {
  durationMs: number
  /** Called every frame with the eased progress 0..1 (the last call is exactly 1 when finished). */
  onFrame: (eased: number) => void
  /** Called once: true when it ran to the end, false when cancelled. Never after cancel() returns twice. */
  onEnd?: (finished: boolean) => void
  now?: () => number
  raf?: (cb: (t: number) => void) => number
  caf?: (id: number) => void
}

/** Starts a tween and returns its cancel function (safe to call any number of times). */
export function startTween(o: TweenOptions): () => void {
  const now = o.now ?? (() => performance.now())
  const raf = o.raf ?? ((cb) => requestAnimationFrame(cb))
  const caf = o.caf ?? ((id) => cancelAnimationFrame(id))
  const start = now()
  let id = 0
  let done = false
  const end = (finished: boolean) => {
    if (done) return
    done = true
    if (id) caf(id)
    id = 0
    o.onEnd?.(finished)
  }
  const step = (t: number) => {
    id = 0
    if (done) return
    const raw = o.durationMs > 0 ? Math.min(1, (t - start) / o.durationMs) : 1
    o.onFrame(easeInOutCubic(raw))
    if (raw >= 1) end(true)
    else id = raw < 1 ? raf(step) : 0
  }
  id = raf(step)
  return () => end(false)
}
