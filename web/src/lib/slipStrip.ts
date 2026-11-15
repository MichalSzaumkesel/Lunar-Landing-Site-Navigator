// Slip tolerance strip: Sun visible and Earth in view of one scenario window shifted by every whole-day slip.
// Pure logic only; geometry comes from computeMetrics and evaluateMissionRulesAt.
import { DAY_MS, HOUR_MS, MAX_SLIP_DAYS } from '../config/dataRange'
import { ephemCoverage } from './ephem'
import { evaluateMissionRulesAt } from './finder'
import { computeMetrics } from './metrics'
import type { MissionRules, ObserverHeightM, SiteBundle } from './types'

export interface SlipCell {
  slip: number
  /** False when the slipped window leaves the ephemeris range. */
  hasData: boolean
  /** Sun visible and Earth in view, percent of the window. */
  sunPct: number | null
  earthPct: number | null
  /** Mission rules verdict; null when there are no rules or no data. */
  rulesOk: boolean | null
}

export interface SlipRange {
  from: number
  to: number
}

export function slipValues(max = MAX_SLIP_DAYS): number[] {
  const out: number[] = []
  for (let s = -max; s <= max; s++) out.push(s)
  return out
}

/** One cell: metrics of the window [baseStart + slip, + duration) and, with rules, the rule verdict at its start. */
export function computeSlipCell(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  heightM: ObserverHeightM,
  baseStartMs: number,
  durationH: number,
  slip: number,
  rules: MissionRules | null,
): SlipCell {
  const startMs = baseStartMs + slip * DAY_MS
  const endMs = startMs + durationH * HOUR_MS
  const empty: SlipCell = { slip, hasData: false, sunPct: null, earthPct: null, rulesOk: null }
  const { ephem } = bundle
  if (!(ephem.count > 0) || !(ephem.step_minutes > 0)) return empty
  const cov = ephemCoverage(ephem)
  // Every sample of the window [start, end) must exist.
  if (startMs < cov.startMs || endMs > cov.endMs + ephem.step_minutes * 60_000) return empty
  const m = computeMetrics(bundle, { observerHeightM: heightM, startMs, endMs, refMs: startMs })
  if (!m) return empty
  return {
    slip,
    hasData: true,
    sunPct: m.pct_sunlit,
    earthPct: m.pct_earth,
    rulesOk: rules ? evaluateMissionRulesAt(bundle, rules, startMs).valid : null,
  }
}

/**
 * Longest run of consecutive passing slips. Prefers the run that contains the current slip,
 * otherwise the run nearest to it; ties go to the longer run, then to the earlier one.
 */
export function passingRange(cells: readonly SlipCell[], current: number): SlipRange | null {
  const runs: SlipRange[] = []
  let from: number | null = null
  let prev = 0
  for (const c of cells) {
    const pass = c.rulesOk === true
    if (pass && from !== null && c.slip === prev + 1) {
      prev = c.slip
      continue
    }
    if (from !== null) runs.push({ from, to: prev })
    from = pass ? c.slip : null
    prev = c.slip
  }
  if (from !== null) runs.push({ from, to: prev })
  if (runs.length === 0) return null
  const dist = (r: SlipRange) => (current < r.from ? r.from - current : current > r.to ? current - r.to : 0)
  let best = runs[0]
  for (const r of runs.slice(1)) {
    const dr = dist(r)
    const db = dist(best)
    if (dr < db || (dr === db && dr > 0 && r.to - r.from > best.to - best.from)) best = r
  }
  return best
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : '0'
}

export function slipLabel(slip: number): string {
  return `slip ${signed(slip)} d`
}

export function cellTooltip(c: SlipCell): string {
  if (!c.hasData || c.sunPct === null || c.earthPct === null) return `${slipLabel(c.slip)}: No data`
  const rules = c.rulesOk === null ? '' : c.rulesOk ? ', rules met' : ', rules not met'
  return `${slipLabel(c.slip)}: Sun visible ${Math.round(c.sunPct)}%, Earth in view ${Math.round(c.earthPct)}%${rules}`
}

/** The one sentence under the strip. */
export function stripSentence(cells: readonly SlipCell[], current: number, hasRules: boolean, max = MAX_SLIP_DAYS): string {
  if (!hasRules) return 'The strip only shows Sun visible; there are no mission rules to check.'
  const r = passingRange(cells, current)
  if (!r) return `No slip between -${max} and +${max} days meets the mission rules.`
  const rule =
    r.from === r.to
      ? `Mission rules hold for a slip of ${signed(r.from)} days.`
      : `Mission rules hold for slips from ${signed(r.from)} to ${signed(r.to)} days.`
  // Say so when the slip in use is outside the passing run (or fails on its own, e.g. between two runs).
  if (current < r.from || current > r.to) {
    const cur = cells.find((c) => c.slip === current)
    // No data at the current slip: do not claim a verdict.
    if (cur && !cur.hasData) return `${rule} Current slip ${signed(current)} d has no data.`
    return `${rule} Current slip ${signed(current)} d does not meet them.`
  }
  return rule
}

/** Memo key: everything the cells depend on, and nothing about the slip or the cursor. */
export function stripKey(
  siteId: string,
  baseStartMs: number,
  durationH: number,
  heightM: ObserverHeightM,
  rules: MissionRules | null,
): string {
  return [siteId, baseStartMs, durationH, heightM, rules ? JSON.stringify(rules) : '-'].join('|')
}
