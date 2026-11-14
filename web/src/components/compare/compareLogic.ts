// Pure logic for the scenario comparison table (W22).
// Calculates comparison criteria, column sorting, better-value highlights, and value formatting.
import { ephemCoverage } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import { computeMetrics, pickMaskFor } from '../../lib/metrics'
import type { ObserverHeightM, ScenarioMetrics, SiteBundle } from '../../lib/types'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import type { Scenario } from '../../state/types'
import { fmtNum } from '../sky/geometry'

export type CompareCriterionId =
  | 'pct_sunlit'
  | 'longest_dark_h'
  | 'longest_no_earth_h'
  | 'pct_earth'
  | 'time_to_sunset_h'
  | 'time_to_earthset_h'
  | 'highest_horizon_el_deg'
  | 'min_sun_clearance_deg'

export interface CompareCriterion {
  id: CompareCriterionId
  label: string
  unit: string
  tooltip: string
  better: 'higher' | 'lower'
}

/** The 8 comparison criteria computed from lib/metrics.ts and bundle horizon/ephemeris. */
export const COMPARE_CRITERIA: readonly CompareCriterion[] = [
  {
    id: 'pct_sunlit',
    label: 'Sun visible (% of window)',
    unit: '%',
    tooltip: 'pct_sunlit: share of samples in the window where the Sun centre is above the terrain horizon.',
    better: 'higher',
  },
  {
    id: 'longest_dark_h',
    label: 'Longest continuous Sun gap',
    unit: 'h',
    tooltip: 'longest_dark_h: longest run of consecutive samples with the Sun below the terrain horizon, in hours.',
    better: 'lower',
  },
  {
    id: 'longest_no_earth_h',
    label: 'Longest Earth-in-view gap',
    unit: 'h',
    tooltip: 'longest_no_earth_h: longest run of consecutive samples with the Earth below the terrain horizon, in hours.',
    better: 'lower',
  },
  {
    id: 'pct_earth',
    label: 'Earth in view (%)',
    unit: '%',
    tooltip: 'pct_earth: share of samples in the window where the Earth centre is above the terrain horizon.',
    better: 'higher',
  },
  {
    id: 'time_to_sunset_h',
    label: 'Next sunset countdown',
    unit: 'h',
    tooltip: 'time_to_sunset_h: time until the Sun centre passes below the terrain horizon, in hours.',
    better: 'higher',
  },
  {
    id: 'time_to_earthset_h',
    label: 'Next Earthset countdown',
    unit: 'h',
    tooltip: 'time_to_earthset_h: time until the Earth centre passes below the terrain horizon, in hours.',
    better: 'higher',
  },
  {
    id: 'highest_horizon_el_deg',
    label: 'Highest terrain horizon elevation',
    unit: 'deg',
    tooltip: 'Highest elevation angle of the local terrain horizon mask in degrees.',
    better: 'lower',
  },
  {
    id: 'min_sun_clearance_deg',
    label: 'Minimum Sun clearance',
    unit: 'deg',
    tooltip: 'Lowest elevation of the Sun centre relative to the local terrain horizon during the window, in degrees.',
    better: 'higher',
  },
] as const

/** Finds the highest elevation angle in degrees for the given observer height mask. */
export function computeHighestHorizon(
  horizon: Pick<SiteBundle['horizon'], 'masks'> | null | undefined,
  observerHeightM: number,
): number {
  const mask = pickMaskFor(horizon, observerHeightM)
  if (!mask || mask.length === 0) return 0
  let maxEl = -Infinity
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > maxEl) maxEl = mask[i]
  }
  return Number.isFinite(maxEl) ? maxEl : 0
}

/**
 * Computes minimum Sun clearance (degrees above local terrain horizon) over all hourly samples in the window.
 * Returns null if the window has no valid samples or is outside coverage.
 */
export function computeMinSunClearance(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'> | null | undefined,
  observerHeightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): number | null {
  if (!bundle?.ephem || !bundle?.horizon) return null
  const { ephem, horizon } = bundle
  if (ephem.count <= 0 || startMs >= endMs) return null

  const { startMs: covStart } = ephemCoverage(ephem)
  const stepMs = ephem.step_minutes * 60_000
  if (stepMs <= 0) return null

  let kStart = Math.max(0, Math.floor((startMs - covStart) / stepMs))
  while (kStart < ephem.count && covStart + kStart * stepMs < startMs) {
    kStart++
  }
  let kEnd = Math.min(ephem.count, Math.ceil((endMs - covStart) / stepMs) + 1)
  while (kEnd > kStart && covStart + (kEnd - 1) * stepMs >= endMs) {
    kEnd--
  }
  if (kEnd <= kStart) return null

  const mask = pickMaskFor(horizon, observerHeightM)
  const azStepDeg = horizon.az_step_deg
  let minClear = Infinity

  for (let k = kStart; k < kEnd; k++) {
    const az = ephem.sun.az[k]
    const el = ephem.sun.el[k]
    const h = horizonAt(mask, azStepDeg, az)
    const clear = el - h
    if (clear < minClear) {
      minClear = clear
    }
  }

  return Number.isFinite(minClear) ? minClear : null
}

/** Formats a metric numeric value with units, or displays neutral fallback text when null. */
export function formatCriterionValue(
  id: CompareCriterionId,
  value: number | null,
  metrics?: ScenarioMetrics | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    if (id === 'time_to_sunset_h' && metrics?.gaps?.sunset === 'beyond_data') {
      return 'None in range'
    }
    if (id === 'time_to_earthset_h' && metrics?.gaps?.earthset === 'beyond_data') {
      return 'None in range'
    }
    return '—'
  }

  switch (id) {
    case 'pct_sunlit':
    case 'pct_earth':
      return `${fmtNum(value, 1)} %`
    case 'longest_dark_h':
    case 'longest_no_earth_h':
      return `${fmtNum(value, Number.isInteger(value) ? 0 : 1)} h`
    case 'time_to_sunset_h':
    case 'time_to_earthset_h':
      return `${fmtNum(value, 1)} h`
    case 'highest_horizon_el_deg':
      return `${fmtNum(value, 2, true)} deg`
    case 'min_sun_clearance_deg':
      return `${fmtNum(value, 2, true)} deg`
  }
}

export type ScenarioCompareStatus = 'loading' | 'ready' | 'error' | 'outside_range'

export interface ScenarioCompareData {
  scenario: Scenario
  bundle: SiteBundle | null
  status: ScenarioCompareStatus
  metrics: ScenarioMetrics | null
  highestHorizonDeg: number | null
  minSunClearanceDeg: number | null
  values: Record<CompareCriterionId, number | null>
  displayValues: Record<CompareCriterionId, string>
}

/** Evaluates all 8 criteria for a single scenario. */
export function computeScenarioValues(
  scenario: Scenario,
  bundle: SiteBundle | null,
  observerHeightM: ObserverHeightM,
  cursorH: number,
): ScenarioCompareData {
  if (!bundle) {
    const emptyValues = {} as Record<CompareCriterionId, number | null>
    const emptyDisplay = {} as Record<CompareCriterionId, string>
    for (const c of COMPARE_CRITERIA) {
      emptyValues[c.id] = null
      emptyDisplay[c.id] = '—'
    }
    return {
      scenario,
      bundle: null,
      status: 'loading',
      metrics: null,
      highestHorizonDeg: null,
      minSunClearanceDeg: null,
      values: emptyValues,
      displayValues: emptyDisplay,
    }
  }

  const { startMs, endMs } = scenarioWindowMs(scenario)
  const refMs = scenarioCursorMs(scenario, cursorH)
  const metrics = computeMetrics(bundle, {
    observerHeightM,
    startMs,
    endMs,
    refMs,
  })

  if (!metrics) {
    const emptyValues = {} as Record<CompareCriterionId, number | null>
    const emptyDisplay = {} as Record<CompareCriterionId, string>
    for (const c of COMPARE_CRITERIA) {
      emptyValues[c.id] = null
      emptyDisplay[c.id] = 'Outside range'
    }
    return {
      scenario,
      bundle,
      status: 'outside_range',
      metrics: null,
      highestHorizonDeg: null,
      minSunClearanceDeg: null,
      values: emptyValues,
      displayValues: emptyDisplay,
    }
  }

  const highestHorizonDeg = computeHighestHorizon(bundle.horizon, observerHeightM)
  const minSunClearanceDeg = computeMinSunClearance(bundle, observerHeightM, startMs, endMs)

  const values: Record<CompareCriterionId, number | null> = {
    pct_sunlit: metrics.pct_sunlit,
    longest_dark_h: metrics.longest_dark_h,
    longest_no_earth_h: metrics.longest_no_earth_h,
    pct_earth: metrics.pct_earth,
    time_to_sunset_h: metrics.time_to_sunset_h,
    time_to_earthset_h: metrics.time_to_earthset_h,
    highest_horizon_el_deg: highestHorizonDeg,
    min_sun_clearance_deg: minSunClearanceDeg,
  }

  const displayValues: Record<CompareCriterionId, string> = {
    pct_sunlit: formatCriterionValue('pct_sunlit', values.pct_sunlit, metrics),
    longest_dark_h: formatCriterionValue('longest_dark_h', values.longest_dark_h, metrics),
    longest_no_earth_h: formatCriterionValue('longest_no_earth_h', values.longest_no_earth_h, metrics),
    pct_earth: formatCriterionValue('pct_earth', values.pct_earth, metrics),
    time_to_sunset_h: formatCriterionValue('time_to_sunset_h', values.time_to_sunset_h, metrics),
    time_to_earthset_h: formatCriterionValue('time_to_earthset_h', values.time_to_earthset_h, metrics),
    highest_horizon_el_deg: formatCriterionValue('highest_horizon_el_deg', values.highest_horizon_el_deg, metrics),
    min_sun_clearance_deg: formatCriterionValue('min_sun_clearance_deg', values.min_sun_clearance_deg, metrics),
  }

  return {
    scenario,
    bundle,
    status: 'ready',
    metrics,
    highestHorizonDeg,
    minSunClearanceDeg,
    values,
    displayValues,
  }
}

export interface BetterHighlightResult {
  betterScenarioIds: Set<string>
  tag: 'higher' | 'lower' | null
}

/**
 * Finds scenarios with the better value for a criterion row.
 * Returns an empty set if fewer than 2 valid numbers exist or if all valid numbers are equal.
 * Uses neutral tag 'higher' or 'lower' without verdicts.
 */
export function findBetterScenarioIds(
  criterion: CompareCriterion,
  scenarios: readonly ScenarioCompareData[],
): BetterHighlightResult {
  const validEntries: Array<{ id: string; val: number }> = []

  for (const s of scenarios) {
    const v = s.values[criterion.id]
    if (v !== null && Number.isFinite(v)) {
      validEntries.push({ id: s.scenario.id, val: v })
    }
  }

  if (validEntries.length < 2) {
    return { betterScenarioIds: new Set(), tag: null }
  }

  const targetVal =
    criterion.better === 'higher'
      ? Math.max(...validEntries.map((e) => e.val))
      : Math.min(...validEntries.map((e) => e.val))

  const minVal = Math.min(...validEntries.map((e) => e.val))
  const maxVal = Math.max(...validEntries.map((e) => e.val))

  // If all valid values are identical, do not highlight
  if (Math.abs(maxVal - minVal) < 1e-9) {
    return { betterScenarioIds: new Set(), tag: null }
  }

  const betterIds = new Set<string>()
  for (const entry of validEntries) {
    if (Math.abs(entry.val - targetVal) < 1e-9) {
      betterIds.add(entry.id)
    }
  }

  return { betterScenarioIds: betterIds, tag: criterion.better }
}

/**
 * Reorders scenario columns based on a selected criterion and sort direction.
 * Scenarios with null or non-ready status are placed at the end.
 */
export function sortScenariosByCriterion(
  scenarios: readonly ScenarioCompareData[],
  criterionId: CompareCriterionId | null,
  direction: 'asc' | 'desc',
): ScenarioCompareData[] {
  if (!criterionId) {
    return [...scenarios]
  }

  const indexed = scenarios.map((s, idx) => ({ s, idx }))

  indexed.sort((a, b) => {
    const valA = a.s.values[criterionId]
    const valB = b.s.values[criterionId]

    const aValid = valA !== null && Number.isFinite(valA)
    const bValid = valB !== null && Number.isFinite(valB)

    if (!aValid && !bValid) return a.idx - b.idx
    if (!aValid) return 1
    if (!bValid) return -1

    const numA = valA as number
    const numB = valB as number

    if (Math.abs(numA - numB) < 1e-9) {
      return a.idx - b.idx
    }

    return direction === 'asc' ? numA - numB : numB - numA
  })

  return indexed.map((e) => e.s)
}
