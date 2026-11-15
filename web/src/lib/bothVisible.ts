// Derived metric (not part of the contract metric set): hours in which the Sun is visible and the
// Earth is in view at the same time, and the longest consecutive stretch of that.
// It reads the same ephemeris samples, terrain mask and visibility rule (body centre at or above the
// horizon) as `computeMetrics`, so its share always equals `pct_both` of the same window.
import { ephemCoverage } from './ephem.ts'
import { horizonAt } from './horizon.ts'
import { pickMaskFor, type MetricsInput } from './metrics.ts'
import type { SiteBundle } from './types.ts'

export interface BothVisible {
  /** Share of the window samples with the Sun visible and the Earth in view together, 0 to 100. */
  pct: number
  /** Longest run of consecutive such samples, times the sample step, in hours. */
  longestH: number
  /** Number of samples in the window. */
  samples: number
}

/** Same sample range as `computeMetrics`: t_k in [startMs, endMs) inside the ephemeris coverage. */
function sampleRange(
  ephem: SiteBundle['ephem'],
  startMs: number,
  endMs: number,
): { kStart: number; kEnd: number } | null {
  const stepMs = ephem.step_minutes * 60_000
  if (ephem.count <= 0 || stepMs <= 0 || !(startMs < endMs)) return null
  const { startMs: cov } = ephemCoverage(ephem)
  let kStart = Math.max(0, Math.floor((startMs - cov) / stepMs))
  while (kStart < ephem.count && cov + kStart * stepMs < startMs) kStart++
  let kEnd = Math.min(ephem.count, Math.ceil((endMs - cov) / stepMs) + 1)
  while (kEnd > kStart && cov + (kEnd - 1) * stepMs >= endMs) kEnd--
  return kEnd > kStart ? { kStart, kEnd } : null
}

/** Null when the window has no samples (outside the data coverage). */
export function computeBothVisible(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  input: Pick<MetricsInput, 'observerHeightM' | 'startMs' | 'endMs'>,
): BothVisible | null {
  const { ephem, horizon } = bundle
  const range = sampleRange(ephem, input.startMs, input.endMs)
  if (!range) return null
  const mask = pickMaskFor(horizon, input.observerHeightM)
  const step = horizon.az_step_deg
  let count = 0
  let run = 0
  let longest = 0
  for (let k = range.kStart; k < range.kEnd; k++) {
    const sunOn = ephem.sun.el[k] - horizonAt(mask, step, ephem.sun.az[k]) >= 0
    const earthOn = ephem.earth.el[k] - horizonAt(mask, step, ephem.earth.az[k]) >= 0
    if (sunOn && earthOn) {
      count++
      run++
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  const n = range.kEnd - range.kStart
  return { pct: (count / n) * 100, longestH: longest * (ephem.step_minutes / 60), samples: n }
}

/** "62.5 % of window; longest 40 h" (one decimal like the metric rows; hours, or days from 48 h). */
export function formatBothVisible(b: BothVisible): string {
  const pct = b.pct.toFixed(1)
  const h = Math.round(b.longestH)
  const span = h >= 48 ? `${Math.round(h / 24)} d` : `${h} h`
  return `${pct} % of window; longest ${span}`
}

export const BOTH_DERIVED_TIP =
  'Derived: computed from the same samples and terrain horizon as the Sun visible and Earth in view values. Counts samples where both are true at once.'
