import { ephemCoverage } from '../../lib/ephem'
import { earthIlluminatedFraction } from '../../lib/earthPhase'
import { horizonAt } from '../../lib/horizon'
import { mastDelta } from '../../lib/mastDelta'
import { bodyFraction, pickMaskFor } from '../../lib/metrics'
import type { ObserverHeightM, SiteBundle } from '../../lib/types'

/** Extra window values for the Simple card; every field is null when it cannot be computed. */
export interface WindowDetails {
  maxSunElDeg: number | null
  /** Share of Sun-visible time when the Sun disc is only partly above the horizon, 0..100. */
  sunPartlyHiddenPct: number | null
  /** Extra hours of Sun visible with a 10 m observer compared with 2 m; null without both heights. */
  mastGainH: number | null
  maxEarthElDeg: number | null
  earthLitPct: number | null
  maxHillDeg: number | null
}

/** Computes the extra window values from the ephemeris, the horizon mask and mastDelta. */
export function computeWindowDetails(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  heightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): WindowDetails {
  const { ephem, horizon } = bundle
  const mask = pickMaskFor(horizon, heightM)
  let maxHill: number | null = null
  for (const h of mask) {
    if (Number.isFinite(h) && (maxHill === null || h > maxHill)) maxHill = h
  }

  const none: WindowDetails = {
    maxSunElDeg: null,
    sunPartlyHiddenPct: null,
    mastGainH: null,
    maxEarthElDeg: null,
    earthLitPct: null,
    maxHillDeg: maxHill,
  }
  const stepMs = ephem.step_minutes * 60_000
  if (ephem.count <= 0 || stepMs <= 0 || startMs >= endMs) return none

  const covStart = ephemCoverage(ephem).startMs
  const kStart = Math.max(0, Math.ceil((startMs - covStart) / stepMs))
  const kEnd = Math.min(ephem.count, Math.ceil((endMs - covStart) / stepMs))
  if (kEnd <= kStart) return none

  const azStep = horizon.az_step_deg
  let maxSun = -Infinity
  let maxEarth = -Infinity
  let sunlit = 0
  let partial = 0
  let litSum = 0
  for (let k = kStart; k < kEnd; k++) {
    const sun = { az: ephem.sun.az[k], el: ephem.sun.el[k] }
    const earth = { az: ephem.earth.az[k], el: ephem.earth.el[k] }
    if (sun.el > maxSun) maxSun = sun.el
    if (earth.el > maxEarth) maxEarth = earth.el
    const clear = sun.el - horizonAt(mask, azStep, sun.az)
    if (clear >= 0) {
      sunlit++
      if (bodyFraction(clear, ephem.sun_ang_radius_deg) < 1) partial++
    }
    litSum += earthIlluminatedFraction(sun, earth)
  }

  const n = kEnd - kStart
  const delta = mastDelta(bundle, startMs, endMs)
  return {
    maxSunElDeg: Number.isFinite(maxSun) ? maxSun : null,
    sunPartlyHiddenPct: sunlit > 0 ? (partial / sunlit) * 100 : null,
    mastGainH: delta ? delta.gainH : null,
    maxEarthElDeg: Number.isFinite(maxEarth) ? maxEarth : null,
    earthLitPct: (litSum / n) * 100,
    maxHillDeg: maxHill,
  }
}
