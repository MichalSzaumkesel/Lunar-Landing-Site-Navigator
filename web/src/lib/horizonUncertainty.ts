import { computeMetrics, pickMaskFor } from './metrics.ts'
import type { MetricsInput } from './metrics.ts'
import type { HorizonFile, ObserverHeightM, SiteBundle } from './types.ts'

/** Share of the window (percent) with the horizon mask shifted by +u (lo) and -u (hi). */
export interface ShareRange {
  lo: number
  hi: number
}

export interface HorizonShareRange {
  /** The shipped `uncertainty_deg`, in degrees. */
  uncertaintyDeg: number
  sun: ShareRange
  earth: ShareRange
}

/** `uncertainty_deg` of a horizon file when it is a usable positive number, else null (custom, mock, synthetic). */
export function horizonUncertaintyDeg(horizon: Pick<HorizonFile, 'uncertainty_deg'> | null | undefined): number | null {
  const u = horizon?.uncertainty_deg
  return typeof u === 'number' && Number.isFinite(u) && u > 0 ? u : null
}

/** Copy of a mask with every elevation shifted by `deltaDeg`. */
export function shiftMask(mask: readonly number[], deltaDeg: number): number[] {
  return mask.map((el) => el + deltaDeg)
}

type Source = Pick<SiteBundle, 'horizon' | 'ephem'>

function withShiftedMask(bundle: Source, heightM: number, deltaDeg: number): Source {
  const mask = shiftMask(pickMaskFor(bundle.horizon, heightM), deltaDeg)
  return { ephem: bundle.ephem, horizon: { ...bundle.horizon, masks: { [String(heightM)]: mask } } }
}

/**
 * Sun visible and Earth in view shares for the window when the horizon is raised (lo) and lowered (hi)
 * by `deltaDeg`, through the same metrics engine as the headline values. Null when the window is empty.
 */
export function computeShareRange(bundle: Source, input: MetricsInput, deltaDeg: number): HorizonShareRange | null {
  const d = Math.abs(deltaDeg)
  const up = computeMetrics(withShiftedMask(bundle, input.observerHeightM, d), input)
  const down = computeMetrics(withShiftedMask(bundle, input.observerHeightM, -d), input)
  if (!up || !down) return null
  return {
    uncertaintyDeg: d,
    sun: { lo: up.pct_sunlit, hi: down.pct_sunlit },
    earth: { lo: up.pct_earth, hi: down.pct_earth },
  }
}

const cache = new WeakMap<object, Map<string, HorizonShareRange | null>>()

/**
 * Memoised per bundle, observer height and window. Null when the horizon file has no `uncertainty_deg`.
 * Never depends on the time cursor.
 */
export function horizonShareRange(
  bundle: Source,
  heightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): HorizonShareRange | null {
  const u = horizonUncertaintyDeg(bundle.horizon)
  if (u === null) return null
  let byKey = cache.get(bundle)
  if (!byKey) {
    byKey = new Map()
    cache.set(bundle, byKey)
  }
  const key = `${heightM}|${startMs}|${endMs}`
  if (byKey.has(key)) return byKey.get(key) ?? null
  const value = computeShareRange(bundle, { observerHeightM: heightM, startMs, endMs, refMs: startMs }, u)
  byKey.set(key, value)
  return value
}

/** "50.9–53.0", one decimal like the headline value. */
export function formatShareRange(range: ShareRange): string {
  return `${range.lo.toFixed(1)}–${range.hi.toFixed(1)}`
}

/** Tooltip of the range, quoting what the shipped file says the uncertainty covers. */
export function uncertaintyTip(uncertaintyDeg: number): string {
  return (
    `Range if the horizon were higher or lower by ±${uncertaintyDeg}°. ` +
    `The shipped value is the worst RMS of our own horizon computation under DEM x2/x4 degradation and ±1 px site shifts; ` +
    `it excludes LOLA height and geolocation error.`
  )
}
