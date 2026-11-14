import { ephemCoverage } from './ephem'
import { computeMetrics } from './metrics'
import type { SiteBundle } from './types'

export interface MastDeltaResult {
  sunHours2: number
  sunHours10: number
  gainH: number
  longestDark2H: number
  longestDark10H: number
}

/**
 * Compares Sun visibility duration between a 2 m observer and a 10 m mast.
 *
 * Evaluates geometric visibility of the Sun centre above the terrain horizon.
 * Power and communication yield are not modelled.
 */
export function mastDelta(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  startMs: number,
  endMs: number,
): MastDeltaResult | null {
  if (!bundle?.horizon?.masks?.['2'] || !bundle?.horizon?.masks?.['10']) {
    return null
  }
  if (!bundle.ephem || bundle.ephem.count <= 0 || startMs >= endMs) {
    return null
  }

  const { startMs: startMsCov } = ephemCoverage(bundle.ephem)
  const stepMs = bundle.ephem.step_minutes * 60_000
  if (stepMs <= 0 || Number.isNaN(startMsCov)) {
    return null
  }

  let kStart = Math.max(0, Math.floor((startMs - startMsCov) / stepMs))
  while (kStart < bundle.ephem.count && startMsCov + kStart * stepMs < startMs) {
    kStart++
  }
  let kEnd = Math.min(
    bundle.ephem.count,
    Math.ceil((endMs - startMsCov) / stepMs) + 1,
  )
  while (kEnd > kStart && startMsCov + (kEnd - 1) * stepMs >= endMs) {
    kEnd--
  }
  const sampleCount = kEnd - kStart
  if (sampleCount <= 0) {
    return null
  }

  const m2 = computeMetrics(bundle, { observerHeightM: 2, startMs, endMs })
  const m10 = computeMetrics(bundle, { observerHeightM: 10, startMs, endMs })
  if (!m2 || !m10) {
    return null
  }

  const stepH = bundle.ephem.step_minutes / 60
  const windowHours = sampleCount * stepH

  const sunHours2 = (m2.pct_sunlit / 100) * windowHours
  const sunHours10 = (m10.pct_sunlit / 100) * windowHours
  const gainH = sunHours10 - sunHours2

  return {
    sunHours2,
    sunHours10,
    gainH,
    longestDark2H: m2.longest_dark_h,
    longestDark10H: m10.longest_dark_h,
  }
}
