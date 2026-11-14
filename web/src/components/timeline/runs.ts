// Pure helpers for the timeline: per-hour band states, run merging, axis ticks, pointer mapping.
import { DAY_MS, HOUR_MS } from '../../config/dataRange'
import { sampleAt } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import type { SiteBundle } from '../../lib/types'

/** Band state of one hour: 0 off, 1 on, 2 outside the data coverage. */
export const OFF = 0
export const ON = 1
export const NO_DATA = 2
export type BandState = typeof OFF | typeof ON | typeof NO_DATA

/** Hours [start, end) of equal state, as indices from the window start. */
export interface Run {
  start: number
  end: number
  state: BandState
}

export interface BandStates {
  sun: Uint8Array
  earth: Uint8Array
  both: Uint8Array
}

export interface BandRuns {
  sun: Run[]
  earth: Run[]
  both: Run[]
}

/** Merges consecutive equal states into runs. */
export function mergeRuns(states: ArrayLike<number>): Run[] {
  const runs: Run[] = []
  const n = states.length
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || states[i] !== states[start]) {
      runs.push({ start, end: i, state: states[start] as BandState })
      start = i
    }
  }
  return runs
}

/**
 * One state per hour of the window (hour k starts at startMs + k h). A body is on when its centre is
 * above the terrain horizon (contract section 3: sunlit, earth_in_view). Hours the ephemeris does
 * not cover are NO_DATA in every band.
 */
export function computeBandStates(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: number,
  startMs: number,
  durationH: number,
): BandStates {
  const { horizon, ephem } = bundle
  const n = Math.max(0, Math.floor(durationH))
  const masks = horizon.masks
  const mask = masks[String(observerHeightM)] ?? masks['2'] ?? Object.values(masks)[0] ?? []
  const step = horizon.az_step_deg
  const sun = new Uint8Array(n)
  const earth = new Uint8Array(n)
  const both = new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    const s = sampleAt(ephem, startMs + k * HOUR_MS)
    if (!s) {
      sun[k] = earth[k] = both[k] = NO_DATA
      continue
    }
    const sunOn = s.sun.el - horizonAt(mask, step, s.sun.az) >= 0
    const earthOn = s.earth.el - horizonAt(mask, step, s.earth.az) >= 0
    sun[k] = sunOn ? ON : OFF
    earth[k] = earthOn ? ON : OFF
    both[k] = sunOn && earthOn ? ON : OFF
  }
  return { sun, earth, both }
}

export function computeBandRuns(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: number,
  startMs: number,
  durationH: number,
): BandRuns {
  const s = computeBandStates(bundle, observerHeightM, startMs, durationH)
  return { sun: mergeRuns(s.sun), earth: mergeRuns(s.earth), both: mergeRuns(s.both) }
}

/** UTC midnights inside [startMs, endMs]. */
export function dayTicks(startMs: number, endMs: number): number[] {
  const ticks: number[] = []
  for (let t = Math.ceil(startMs / DAY_MS) * DAY_MS; t <= endMs; t += DAY_MS) ticks.push(t)
  return ticks
}

const LABEL_STRIDES = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30, 60]

/** Smallest day stride whose labels are at least `minLabelPx` apart. */
export function labelStride(pxPerDay: number, minLabelPx = 56): number {
  for (const s of LABEL_STRIDES) if (s * pxPerDay >= minLabelPx) return s
  return LABEL_STRIDES[LABEL_STRIDES.length - 1]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2027-08-30 05:00 UTC". */
export function formatUtcMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

/** "Aug 30", in UTC. */
export function formatDayLabel(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** Pointer x (relative to the svg) to hours from the window start, clamped to the window. */
export function hoursFromX(x: number, left: number, plotWidth: number, durationH: number): number {
  if (plotWidth <= 0) return 0
  return Math.min(durationH, Math.max(0, ((x - left) / plotWidth) * durationH))
}

/** Hours from the window start to x. Inverse of `hoursFromX` inside the window. */
export function xFromHours(h: number, left: number, plotWidth: number, durationH: number): number {
  if (durationH <= 0) return left
  return left + (Math.min(durationH, Math.max(0, h)) / durationH) * plotWidth
}

/** Cursor step for an arrow key (1 h, 24 with Shift) or Home/End. Null for other keys. */
export function keyStepH(key: string, shift: boolean): number | null {
  if (key === 'Home') return -1e6
  if (key === 'End') return 1e6
  const size = shift ? 24 : 1
  if (key === 'ArrowRight' || key === 'ArrowUp') return size
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -size
  return null
}
