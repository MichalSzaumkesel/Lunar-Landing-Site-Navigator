// Pure logic of "hold to lock the camera on a body": angle damping, hold timer and lock state.

export type LockBody = 'sun' | 'earth' | 'lander'

/** How long a button must be held before the camera locks. */
export const HOLD_MS = 450
/** A press shows the hold visuals (padlock, fill, progress) only after this long, so a plain click stays quiet. */
export const HOLD_VISUAL_DELAY_MS = 150
/** Time constant of the tracking damping: the remaining error shrinks by 1/e every TRACK_TAU_MS. */
export const TRACK_TAU_MS = 140

export function wrapDeg(a: number): number {
  return ((a % 360) + 360) % 360
}

/** Signed shortest turn from `from` to `to`, in (-180, 180]. */
export function shortestDeltaDeg(from: number, to: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180
  return d === -180 ? 180 : d
}

/** Frame-rate independent damping factor 0..1 for a step of `dtMs`. */
export function dampFactor(dtMs: number, tauMs = TRACK_TAU_MS): number {
  if (dtMs <= 0) return 0
  return 1 - Math.exp(-dtMs / tauMs)
}

/** Moves an angle towards `target` along the shortest way; result in 0..360. */
export function dampAngleDeg(current: number, target: number, dtMs: number, tauMs = TRACK_TAU_MS): number {
  return wrapDeg(current + shortestDeltaDeg(current, target) * dampFactor(dtMs, tauMs))
}

export function dampValue(current: number, target: number, dtMs: number, tauMs = TRACK_TAU_MS): number {
  return current + (target - current) * dampFactor(dtMs, tauMs)
}

/** Pitch that centres a body: follows its elevation but never looks under the horizon. */
export function lockPitchDeg(elDeg: number, limitDeg = 89): number {
  return Math.max(0, Math.min(limitDeg, elDeg))
}

export interface HoldTimerOptions {
  holdMs?: number
  /** Delay after which `onShow` fires while the press continues. */
  showAfterMs?: number
  /** The press lasted long enough to show hold visuals; never fires for a quick click. */
  onShow?: () => void
  onLock: () => void
  setTimer?: (cb: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}

export interface HoldTimer {
  start(): void
  /** Stops a pending hold. Returns true when the hold had already fired (so the release is not a click). */
  cancel(): boolean
  readonly pending: boolean
}

export function createHoldTimer(o: HoldTimerOptions): HoldTimer {
  const set = o.setTimer ?? ((cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number)
  const clear = o.clearTimer ?? ((id) => globalThis.clearTimeout(id))
  let id = 0
  let showId = 0
  let showPending = false
  let pending = false
  let fired = false
  return {
    start() {
      if (pending) return
      fired = false
      pending = true
      if (o.onShow) {
        showPending = true
        showId = set(() => {
          showPending = false
          o.onShow?.()
        }, o.showAfterMs ?? HOLD_VISUAL_DELAY_MS)
      }
      id = set(() => {
        if (showPending) {
          clear(showId)
          showPending = false
          o.onShow?.()
        }
        pending = false
        fired = true
        o.onLock()
      }, o.holdMs ?? HOLD_MS)
    },
    cancel() {
      if (pending) clear(id)
      if (showPending) clear(showId)
      showPending = false
      pending = false
      const wasFired = fired
      fired = false
      return wasFired
    },
    get pending() {
      return pending
    },
  }
}

export type LockState = LockBody | null
export type LockEvent =
  | { type: 'lock'; body: LockBody }
  | { type: 'toggle'; body: LockBody }
  | { type: 'unlock' }

/** Only one lock at a time: locking another body replaces the current one. */
export function lockReducer(state: LockState, ev: LockEvent): LockState {
  switch (ev.type) {
    case 'lock':
      return ev.body
    case 'toggle':
      return state === ev.body ? null : ev.body
    case 'unlock':
      return null
  }
}

const BODY_NAME: Record<LockBody, string> = { sun: 'Sun', earth: 'Earth', lander: 'lander' }

export function bodyName(body: LockBody): string {
  return BODY_NAME[body]
}

export function lockedLabel(body: LockBody): string {
  return `Locked on the ${BODY_NAME[body]}`
}

export function holdHint(body: LockBody): string {
  return `Hold to lock the camera on the ${BODY_NAME[body]}`
}
