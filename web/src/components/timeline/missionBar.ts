import type { MissionRules, SiteBundle } from '../../lib/types'
import { evaluateMissionRulesAt as sharedEvaluate } from '../../lib/finder'

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
  if (key === 'Home') return -1e6
  if (key === 'End') return 1e6
  const size = shift ? 24 : 1
  if (key === 'ArrowRight' || key === 'ArrowUp') return size
  if (key === 'ArrowLeft' || key === 'ArrowDown') return -size
  return null
}

/**
 * Evaluates mission rules for a candidate landing start time on a site bundle.
 * Reuses the shared evaluation function exported from src/lib/finder.ts.
 */
export function evaluateMissionRulesAt(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  rules: MissionRules,
  landingMs: number,
): MissionBarEvaluation {
  const res = sharedEvaluate(bundle, rules, landingMs)
  const decision = missionBarDecision(res.valid, res.failingRule)
  return {
    ...decision,
    pctSunlit: res.pctSunlit,
    longestDarkH: res.longestDarkH,
    pctEarth: res.pctEarth,
    earthAtLanding: res.earthAtLanding,
    sunElAtLanding: res.sunElAtLanding,
  }
}
