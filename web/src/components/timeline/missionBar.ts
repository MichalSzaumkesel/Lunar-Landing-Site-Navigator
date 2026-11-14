import type { MissionRules, SiteBundle } from '../../lib/types'
import { ephemCoverage } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import { pickMaskFor } from '../../lib/metrics'

export interface MissionBarDecision {
  valid: boolean
  color: 'green' | 'red'
  label: 'Rules met' | 'Rules not met'
  failingRule: string | null
  text: string
}

export interface MissionBarEvaluation extends MissionBarDecision {
  pctSunlit?: number
  longestDarkH?: number
  pctEarth?: number
  earthAtLanding?: boolean
  sunElAtLanding?: number
}

/**
 * Pure decision helper for mission bar colour, label, and status text.
 * Green when rules met; red when failed, with the first failing rule named.
 */
export function missionBarDecision(rulesMet: boolean, failingRule?: string | null): MissionBarDecision {
  if (rulesMet) {
    return {
      valid: true,
      color: 'green',
      label: 'Rules met',
      failingRule: null,
      text: 'Rules met',
    }
  }
  const rule = failingRule || 'Unknown rule'
  return {
    valid: false,
    color: 'red',
    label: 'Rules not met',
    failingRule: rule,
    text: `Rules not met: ${rule}`,
  }
}

/**
 * Range clamp at both ends:
 * startH must be >= 0 and <= Math.max(0, durationH - missionDurationH).
 * If missionDurationH is omitted, clamps between 0 and durationH.
 */
export function clampMissionStartH(startH: number, durationH: number, missionDurationH = 0): number {
  if (!Number.isFinite(startH)) return 0
  const maxH = Math.max(0, durationH - missionDurationH)
  return Math.min(maxH, Math.max(0, startH))
}

/**
 * Keyboard step size: ArrowLeft/ArrowRight ±1 h, with Shift ±24 h.
 * Returns null for unhandled keys.
 */
export function missionKeyStepH(key: string, shift: boolean): number | null {
  const size = shift ? 24 : 1
  if (key === 'ArrowRight' || key === 'ArrowUp') return size
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -size
  return null
}

/**
 * Evaluates mission rules for a candidate landing start time on a site bundle.
 * Follows the same rule evaluation order as lib/finder.ts and lib/windowMap.ts.
 */
export function evaluateMissionRulesAt(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  rules: MissionRules,
  landingMs: number,
): MissionBarEvaluation {
  const { ephem, horizon } = bundle
  const count = ephem?.count ?? 0
  if (count <= 0 || rules.missionDurationH <= 0) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  const stepMinutes = ephem.step_minutes ?? 0
  if (stepMinutes <= 0) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  const stepH = stepMinutes / 60
  const stepMs = stepMinutes * 60_000
  const n = Math.round(rules.missionDurationH / stepH)
  if (n < 1) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  if (
    !ephem.sun ||
    !ephem.earth ||
    ephem.sun.az.length < count ||
    ephem.sun.el.length < count ||
    ephem.earth.az.length < count ||
    ephem.earth.el.length < count
  ) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(ephem)
  if (!Number.isFinite(covStartMs) || !Number.isFinite(covEndMs)) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  // Check if landing time and the entire mission duration fall within data coverage
  const missionEndMs = landingMs + rules.missionDurationH * 3600_000
  if (landingMs < covStartMs || missionEndMs > covEndMs + stepMs / 2) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  const kFloat = (landingMs - covStartMs) / stepMs
  const k = Math.round(kFloat)
  if (Math.abs(kFloat - k) > 1e-4 || k < 0 || k + n > count) {
    return { ...missionBarDecision(false, 'Outside data range') }
  }

  const mask = pickMaskFor(horizon, rules.observerHeightM)
  const azStepDeg = horizon?.az_step_deg ?? 0

  // 1. Earth at landing required
  const hEarthLanding = horizonAt(mask, azStepDeg, ephem.earth.az[k])
  const earthAtLanding = ephem.earth.el[k] - hEarthLanding >= 0
  if (rules.earthAtLandingRequired && !earthAtLanding) {
    return {
      ...missionBarDecision(false, 'Earth at landing'),
      earthAtLanding: false,
    }
  }

  // 2. Minimum Sun elevation at landing
  const sunElLanding = ephem.sun.el[k]
  if (rules.minSunElAtLandingDeg !== undefined && sunElLanding < rules.minSunElAtLandingDeg) {
    return {
      ...missionBarDecision(false, 'Sun elevation at landing'),
      earthAtLanding,
      sunElAtLanding: sunElLanding,
    }
  }

  // 3. Interval metrics evaluation over samples [k .. k + n - 1]
  let countSunlit = 0
  let countEarth = 0
  let currentDarkRun = 0
  let maxDarkRun = 0

  for (let j = 0; j < n; j++) {
    const idx = k + j
    const hSun = horizonAt(mask, azStepDeg, ephem.sun.az[idx])
    const isSunlit = ephem.sun.el[idx] - hSun >= 0
    if (isSunlit) {
      countSunlit++
      currentDarkRun = 0
    } else {
      currentDarkRun++
      if (currentDarkRun > maxDarkRun) {
        maxDarkRun = currentDarkRun
      }
    }

    const hEarth = horizonAt(mask, azStepDeg, ephem.earth.az[idx])
    if (ephem.earth.el[idx] - hEarth >= 0) {
      countEarth++
    }
  }

  const pctSunlit = (countSunlit / n) * 100
  const pctEarth = (countEarth / n) * 100
  const longestDarkH = maxDarkRun * stepH

  if (pctSunlit < rules.minPctSunlit) {
    return {
      ...missionBarDecision(false, 'Min % Sun visible'),
      pctSunlit,
      longestDarkH,
      pctEarth,
      earthAtLanding,
      sunElAtLanding: sunElLanding,
    }
  }

  if (longestDarkH > rules.maxLongestDarkH) {
    return {
      ...missionBarDecision(false, 'Max dark stretch'),
      pctSunlit,
      longestDarkH,
      pctEarth,
      earthAtLanding,
      sunElAtLanding: sunElLanding,
    }
  }

  if (pctEarth < rules.minPctEarth) {
    return {
      ...missionBarDecision(false, 'Min % Earth in view'),
      pctSunlit,
      longestDarkH,
      pctEarth,
      earthAtLanding,
      sunElAtLanding: sunElLanding,
    }
  }

  return {
    ...missionBarDecision(true),
    pctSunlit,
    longestDarkH,
    pctEarth,
    earthAtLanding,
    sunElAtLanding: sunElLanding,
  }
}
