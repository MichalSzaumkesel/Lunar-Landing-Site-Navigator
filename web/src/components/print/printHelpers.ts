import type { MissionRules, ScenarioMetrics, SiteBundle } from '../../lib/types'
import type { MastDeltaResult } from '../../lib/mastDelta'
import type { SkySample } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import { fmtNum } from '../sky/geometry'

export interface PrintMetricRow {
  key: string
  label: string
  value: string
  tip: string
}

export interface MissionRuleEvaluation {
  key: string
  label: string
  target: string
  actual: string
  met: boolean
}

export interface MissionRulesResult {
  allMet: boolean
  statusText: string
  rules: MissionRuleEvaluation[]
}

const OUTSIDE_RANGE = 'outside data range'

/** Formats a timestamp into standard UTC display string "YYYY-MM-DD HH:mm UTC". */
export function formatPrintTimestamp(dateInput?: Date | number | string): string {
  const d = dateInput ? new Date(dateInput) : new Date()
  const iso = d.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Formats scenario date range with optional slip: "YYYY-MM-DD to YYYY-MM-DD UTC (X d, slip +Y d)". */
export function formatScenarioDateRange(startMs: number, endMs: number, slipDays = 0): string {
  const s = new Date(startMs).toISOString().slice(0, 10)
  const e = new Date(endMs).toISOString().slice(0, 10)
  const days = Math.round((endMs - startMs) / 86_400_000)
  const slipText = slipDays === 0 ? '' : `, slip ${slipDays > 0 ? '+' : '−'}${Math.abs(slipDays)} d`
  return `${s} to ${e} UTC (${days} d${slipText})`
}

/** Formats lunar coordinates as "89.90° S, 12.30° E". */
export function formatPrintCoords(latDeg: number, lonDeg: number): string {
  const lat = `${Math.abs(latDeg).toFixed(2)}° ${latDeg < 0 ? 'S' : 'N'}`
  const lon = `${Math.abs(lonDeg).toFixed(2)}° ${lonDeg < 0 ? 'W' : 'E'}`
  return `${lat}, ${lon}`
}

/** Formats numbers with units or falls back to 'outside data range' when nullish. */
export function formatUnitValue(
  val: number | null | undefined,
  unit: string,
  digits = 1,
  signed = false,
): string {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return OUTSIDE_RANGE
  }
  return `${fmtNum(val, digits, signed)} ${unit}`
}

/** Formats 10m mast vs 2m gain respecting wording rule (no power claims). */
export function formatMastGainText(delta: MastDeltaResult | null | undefined): string {
  if (!delta || !Number.isFinite(delta.gainH)) {
    return OUTSIDE_RANGE
  }
  if (delta.gainH > 0.05) {
    const formatted = Number.isInteger(delta.gainH) ? delta.gainH : delta.gainH.toFixed(1)
    return `+${formatted} h Sun visible`
  }
  return 'No difference'
}

/** Returns the compact table of the same metrics as the metrics panel. */
export function getPrintMetricRows(
  metrics: ScenarioMetrics | null,
  cursorValues: { sunElDeg: number | null; sunClearanceDeg: number | null } | null,
  mastDeltaResult?: MastDeltaResult | null,
): PrintMetricRow[] {
  const sunEl = cursorValues?.sunElDeg
  const sunClearance = cursorValues?.sunClearanceDeg

  return [
    {
      key: 'sun_el_deg',
      label: 'Sun elevation at cursor',
      value: formatUnitValue(sunEl, 'deg', 2, true),
      tip: 'Elevation of the Sun centre at the cursor time, above the local horizontal.',
    },
    {
      key: 'sun_clearance_deg',
      label: 'Sun clearance at cursor',
      value: formatUnitValue(sunClearance, 'deg', 2, true),
      tip: 'Sun elevation minus terrain horizon elevation at its azimuth.',
    },
    {
      key: 'pct_sunlit',
      label: 'Sun visible',
      value: metrics ? formatUnitValue(metrics.pct_sunlit, '%', 1) : OUTSIDE_RANGE,
      tip: 'Share of window samples where Sun centre is above terrain horizon.',
    },
    {
      key: 'mean_sun_frac',
      label: 'Mean visible Sun disc',
      value: metrics ? formatUnitValue(metrics.mean_sun_frac, '%', 1) : OUTSIDE_RANGE,
      tip: 'Mean visible fraction of the Sun disc over the window.',
    },
    {
      key: 'longest_dark_h',
      label: 'Longest dark stretch',
      value: metrics
        ? formatUnitValue(metrics.longest_dark_h, 'h', Number.isInteger(metrics.longest_dark_h) ? 0 : 1)
        : OUTSIDE_RANGE,
      tip: 'Longest run of consecutive samples with Sun below terrain horizon.',
    },
    {
      key: 'pct_earth',
      label: 'Earth in view',
      value: metrics ? formatUnitValue(metrics.pct_earth, '%', 1) : OUTSIDE_RANGE,
      tip: 'Share of window samples where Earth centre is above terrain horizon.',
    },
    {
      key: 'longest_no_earth_h',
      label: 'Longest without Earth',
      value: metrics
        ? formatUnitValue(
            metrics.longest_no_earth_h,
            'h',
            Number.isInteger(metrics.longest_no_earth_h) ? 0 : 1,
          )
        : OUTSIDE_RANGE,
      tip: 'Longest run of consecutive samples with Earth below terrain horizon.',
    },
    {
      key: 'pct_both',
      label: 'Sun and Earth together',
      value: metrics ? formatUnitValue(metrics.pct_both, '%', 1) : OUTSIDE_RANGE,
      tip: 'Share of window samples where both Sun and Earth are above terrain horizon.',
    },
    {
      key: 'mast_gain',
      label: '10 m mast vs 2 m',
      value: formatMastGainText(mastDeltaResult),
      tip: 'Extra hours with Sun visible at 10 m mast height compared to 2 m.',
    },
  ]
}

/** Formats the provenance line including real or mock status and source IDs. */
export function formatProvenance(bundle: SiteBundle | null): string {
  if (!bundle) return 'No data loaded'
  const siteId = bundle.site?.id ?? 'unknown'
  const isMock = bundle.provenance === 'mock' || bundle.synthetic
  const isApprox = bundle.provenance === 'custom_approx' || bundle.approximate

  if (isMock) {
    const src = bundle.site?.source?.title ? ` (${bundle.site.source.title})` : ''
    return `Mock data · Site ID: ${siteId}${src} · Synthetic test bundle`
  }

  if (isApprox) {
    return `Approximate model · Site ID: ${siteId} · Spherical horizon model`
  }

  const dem = bundle.horizon?.dem?.product ? ` · DEM: ${bundle.horizon.dem.product}` : ''
  const ephemQuery = bundle.ephem?.horizons_query?.COMMAND ? ` · JPL Horizons ID: ${bundle.ephem.horizons_query.COMMAND}` : ''
  return `Real data · Site ID: ${siteId}${dem}${ephemQuery}`
}

/** Evaluates the mission rules for a scenario against its metrics and start sample. */
export function evaluateMissionRules(
  rules: MissionRules,
  metrics: ScenarioMetrics | null,
  sampleAtStart: SkySample | null,
  horizonMask?: readonly number[],
  azStepDeg?: number,
  scenarioDurationH?: number,
): MissionRulesResult {
  const evaluations: MissionRuleEvaluation[] = []

  // 1. Mission duration
  if (scenarioDurationH !== undefined) {
    const durationMet = scenarioDurationH >= rules.missionDurationH
    evaluations.push({
      key: 'duration',
      label: 'Mission duration',
      target: `≥ ${rules.missionDurationH} h`,
      actual: `${scenarioDurationH} h`,
      met: durationMet,
    })
  }

  // 2. Minimum Sunlit percentage
  const sunlitMet = metrics ? metrics.pct_sunlit >= rules.minPctSunlit : false
  evaluations.push({
    key: 'minPctSunlit',
    label: 'Sun visible',
    target: `≥ ${rules.minPctSunlit} %`,
    actual: metrics ? formatUnitValue(metrics.pct_sunlit, '%', 1) : OUTSIDE_RANGE,
    met: sunlitMet,
  })

  // 3. Maximum dark stretch
  const darkMet = metrics ? metrics.longest_dark_h <= rules.maxLongestDarkH : false
  evaluations.push({
    key: 'maxLongestDarkH',
    label: 'Max dark stretch',
    target: `≤ ${rules.maxLongestDarkH} h`,
    actual: metrics
      ? formatUnitValue(metrics.longest_dark_h, 'h', Number.isInteger(metrics.longest_dark_h) ? 0 : 1)
      : OUTSIDE_RANGE,
    met: darkMet,
  })

  // 4. Minimum Earth in view percentage
  const earthMet = metrics ? metrics.pct_earth >= rules.minPctEarth : false
  evaluations.push({
    key: 'minPctEarth',
    label: 'Earth in view',
    target: `≥ ${rules.minPctEarth} %`,
    actual: metrics ? formatUnitValue(metrics.pct_earth, '%', 1) : OUTSIDE_RANGE,
    met: earthMet,
  })

  // 5. Earth at landing required
  if (rules.earthAtLandingRequired) {
    let earthAtLandingMet = false
    let earthActual = OUTSIDE_RANGE
    if (sampleAtStart && horizonMask && horizonMask.length > 0 && azStepDeg) {
      const hEarth = horizonAt(horizonMask, azStepDeg, sampleAtStart.earth.az)
      earthAtLandingMet = sampleAtStart.earth.el - hEarth >= 0
      earthActual = earthAtLandingMet ? 'Earth in view' : 'Earth below horizon'
    }
    evaluations.push({
      key: 'earthAtLanding',
      label: 'Earth at landing',
      target: 'Required',
      actual: earthActual,
      met: earthAtLandingMet,
    })
  } else {
    evaluations.push({
      key: 'earthAtLanding',
      label: 'Earth at landing',
      target: 'Not required',
      actual: 'Optional',
      met: true,
    })
  }

  // 6. Minimum Sun clearance above the terrain horizon at landing (contract section 3)
  if (rules.minSunElAtLandingDeg !== undefined) {
    const canMeasure = sampleAtStart && horizonMask && horizonMask.length > 0 && azStepDeg
    const clearance = canMeasure
      ? sampleAtStart.sun.el - horizonAt(horizonMask, azStepDeg, sampleAtStart.sun.az)
      : null
    evaluations.push({
      key: 'minSunElAtLanding',
      label: 'Sun clearance at landing',
      target: `≥ ${rules.minSunElAtLandingDeg} deg`,
      actual: clearance === null ? OUTSIDE_RANGE : formatUnitValue(clearance, 'deg', 1, true),
      met: clearance !== null && clearance >= rules.minSunElAtLandingDeg,
    })
  }

  const allMet = evaluations.length > 0 && evaluations.every((e) => e.met)
  return {
    allMet,
    statusText: allMet ? 'All rules met' : 'Rules not met',
    rules: evaluations,
  }
}

/**
 * Checks for forbidden wording: ensures no claims about power, energy, signal, or communication.
 * The only permitted occurrence of 'power' or 'link' is inside the standard disclaimer:
 * "Sun visible and Earth in view only, not a power or link guarantee."
 */
export function validateWordingText(text: string): { valid: boolean; violations: string[] } {
  const violations: string[] = []
  const lower = text.toLowerCase()

  if (/\b(solar power|battery|watts?|kwh|mwh|power output|power generation|power supply)\b/.test(lower)) {
    violations.push('Mentions power output/generation')
  }
  if (/\b(energy|joules?)\b/.test(lower)) {
    violations.push('Mentions energy')
  }
  if (/\b(signal|downlink|uplink|bandwidth|rf link|data link)\b/.test(lower)) {
    violations.push('Mentions signal or communication link')
  }
  if (/\b(communication|telemetry|telecom)\b/.test(lower)) {
    violations.push('Mentions communication')
  }

  return {
    valid: violations.length === 0,
    violations,
  }
}

export const PRINT_FOOTER_TEXT = 'Sun visible and Earth in view only, not a power or link guarantee.'
