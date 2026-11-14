import type { LandingWindow, MissionRules, SiteBundle } from './types'
import { horizonAt } from './horizon'
import { ephemCoverage } from './ephem'
import { pickMaskFor } from './metrics'

export interface WindowMapInput {
  siteId: string
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>
}

export interface WindowMapRow {
  siteId: string
  startMs: number // landing time of column 0
  stepMs: number // distance between columns (dayStepH hours)
  count: number // number of columns
  pctSunlit: Float32Array // pct_sunlit (0..100) of the mission interval starting at each column
  pctEarth: Float32Array // pct_earth (0..100) of the same interval
  longestDarkH: Float32Array
  valid: Uint8Array // 1 when every MissionRules rule holds for a landing at that column time, else 0; 255 when the interval leaves the data coverage
}

export function computeWindowMap(
  inputs: WindowMapInput[],
  rules: MissionRules,
  opts?: { dayStepH?: number; startMs?: number; endMs?: number }
): WindowMapRow[] {
  if (inputs.length === 0) {
    return []
  }

  const dayStepH = opts?.dayStepH ?? 24
  if (dayStepH <= 0) {
    return inputs.map((input) => ({
      siteId: input.siteId,
      startMs: 0,
      stepMs: 0,
      count: 0,
      pctSunlit: new Float32Array(0),
      pctEarth: new Float32Array(0),
      longestDarkH: new Float32Array(0),
      valid: new Uint8Array(0),
    }))
  }

  const stepMs = dayStepH * 3600_000

  const validInputs = inputs.filter(
    (input) =>
      input.bundle.ephem &&
      input.bundle.ephem.count > 0 &&
      input.bundle.ephem.step_minutes > 0 &&
      input.bundle.ephem.sun &&
      input.bundle.ephem.earth &&
      input.bundle.ephem.sun.az.length >= input.bundle.ephem.count &&
      input.bundle.ephem.sun.el.length >= input.bundle.ephem.count &&
      input.bundle.ephem.earth.az.length >= input.bundle.ephem.count &&
      input.bundle.ephem.earth.el.length >= input.bundle.ephem.count,
  )

  if (validInputs.length === 0) {
    return inputs.map((input) => ({
      siteId: input.siteId,
      startMs: opts?.startMs ?? 0,
      stepMs,
      count: 0,
      pctSunlit: new Float32Array(0),
      pctEarth: new Float32Array(0),
      longestDarkH: new Float32Array(0),
      valid: new Uint8Array(0),
    }))
  }

  const coverages = validInputs.map((input) => ephemCoverage(input.bundle.ephem))
  const start0Ms = Math.min(...coverages.map((c) => c.startMs))
  const end0Ms = Math.max(...coverages.map((c) => c.endMs))

  const reqStartMs =
    opts?.startMs !== undefined ? Math.max(start0Ms, opts.startMs) : start0Ms
  const reqEndMs =
    opts?.endMs !== undefined ? Math.min(end0Ms, opts.endMs) : end0Ms

  // A NaN bound (Math.max/min propagate it) would otherwise reach `new Float32Array(NaN)`.
  if (Number.isNaN(reqStartMs) || Number.isNaN(reqEndMs) || reqStartMs > reqEndMs) {
    return inputs.map((input) => ({
      siteId: input.siteId,
      startMs: Number.isNaN(opts?.startMs ?? 0) ? start0Ms : (opts?.startMs ?? start0Ms),
      stepMs,
      count: 0,
      pctSunlit: new Float32Array(0),
      pctEarth: new Float32Array(0),
      longestDarkH: new Float32Array(0),
      valid: new Uint8Array(0),
    }))
  }

  let mMin = Math.ceil((reqStartMs - start0Ms) / stepMs - 1e-9)
  if (start0Ms + mMin * stepMs < reqStartMs) {
    mMin++
  }
  mMin = Math.max(0, mMin)

  let mMax = Math.floor((reqEndMs - start0Ms) / stepMs + 1e-9)
  if (start0Ms + mMax * stepMs > reqEndMs) {
    mMax--
  }
  const maxMInCoverage = Math.floor((end0Ms - start0Ms) / stepMs + 1e-9)
  mMax = Math.min(mMax, maxMInCoverage)

  if (mMin > mMax) {
    return inputs.map((input) => ({
      siteId: input.siteId,
      startMs: opts?.startMs ?? start0Ms,
      stepMs,
      count: 0,
      pctSunlit: new Float32Array(0),
      pctEarth: new Float32Array(0),
      longestDarkH: new Float32Array(0),
      valid: new Uint8Array(0),
    }))
  }

  const count = mMax - mMin + 1
  const col0StartMs = start0Ms + mMin * stepMs

  const rows: WindowMapRow[] = []

  for (const input of inputs) {
    const row: WindowMapRow = {
      siteId: input.siteId,
      startMs: col0StartMs,
      stepMs,
      count,
      pctSunlit: new Float32Array(count),
      pctEarth: new Float32Array(count),
      longestDarkH: new Float32Array(count),
      valid: new Uint8Array(count),
    }
    rows.push(row)

    const { ephem, horizon } = input.bundle
    const ephemCount = ephem?.count ?? 0
    const stepMinutes = ephem?.step_minutes ?? 0

    if (
      ephemCount <= 0 ||
      stepMinutes <= 0 ||
      !ephem.sun ||
      !ephem.earth ||
      ephem.sun.az.length < ephemCount ||
      ephem.sun.el.length < ephemCount ||
      ephem.earth.az.length < ephemCount ||
      ephem.earth.el.length < ephemCount
    ) {
      row.valid.fill(255)
      continue
    }

    const mask = pickMaskFor(horizon, rules.observerHeightM)
    const azStepDeg = horizon?.az_step_deg ?? 0

    const sunlit = new Uint8Array(ephemCount)
    const earth = new Uint8Array(ephemCount)
    const sunClearance = new Float32Array(ephemCount)

    for (let i = 0; i < ephemCount; i++) {
      const hSun = horizonAt(mask, azStepDeg, ephem.sun.az[i])
      sunClearance[i] = ephem.sun.el[i] - hSun
      sunlit[i] = sunClearance[i] >= 0 ? 1 : 0

      const hEarth = horizonAt(mask, azStepDeg, ephem.earth.az[i])
      earth[i] = ephem.earth.el[i] - hEarth >= 0 ? 1 : 0
    }

    const prefSunlit = new Int32Array(ephemCount + 1)
    const prefEarth = new Int32Array(ephemCount + 1)
    for (let i = 0; i < ephemCount; i++) {
      prefSunlit[i + 1] = prefSunlit[i] + sunlit[i]
      prefEarth[i + 1] = prefEarth[i] + earth[i]
    }

    const siteStartMs = Date.parse(ephem.start_utc)
    const siteStepMs = stepMinutes * 60_000
    const siteStepH = stepMinutes / 60
    const n =
      rules.missionDurationH > 0 && siteStepH > 0
        ? Math.round(rules.missionDurationH / siteStepH)
        : 0

    if (n < 1) {
      for (let c = 0; c < count; c++) {
        const targetMs = col0StartMs + c * stepMs
        const kFloat = (targetMs - siteStartMs) / siteStepMs
        const k = Math.round(kFloat)
        if (Math.abs(kFloat - k) > 1e-4 || k < 0 || k >= ephemCount) {
          row.valid[c] = 255
        } else {
          row.valid[c] = 0
        }
      }
      continue
    }

    for (let c = 0; c < count; c++) {
      const targetMs = col0StartMs + c * stepMs
      const kFloat = (targetMs - siteStartMs) / siteStepMs
      const k = Math.round(kFloat)

      if (Math.abs(kFloat - k) > 1e-4 || k < 0 || k + n > ephemCount) {
        row.valid[c] = 255
        continue
      }

      const countSunlit = prefSunlit[k + n] - prefSunlit[k]
      const countEarth = prefEarth[k + n] - prefEarth[k]
      const pctSunlit = (countSunlit / n) * 100
      const pctEarth = (countEarth / n) * 100

      let currentDarkRun = 0
      let maxDarkRun = 0
      for (let j = 0; j < n; j++) {
        if (sunlit[k + j] === 1) {
          currentDarkRun = 0
        } else {
          currentDarkRun++
          if (currentDarkRun > maxDarkRun) {
            maxDarkRun = currentDarkRun
          }
        }
      }
      const longestDarkH = maxDarkRun * siteStepH

      row.pctSunlit[c] = pctSunlit
      row.pctEarth[c] = pctEarth
      row.longestDarkH[c] = longestDarkH

      let isValid = true

      if (rules.earthAtLandingRequired && earth[k] === 0) {
        isValid = false
      }

      if (
        isValid &&
        rules.minSunElAtLandingDeg !== undefined &&
        sunClearance[k] < rules.minSunElAtLandingDeg
      ) {
        isValid = false
      }

      if (
        isValid &&
        (pctSunlit < rules.minPctSunlit ||
          longestDarkH > rules.maxLongestDarkH ||
          pctEarth < rules.minPctEarth)
      ) {
        isValid = false
      }

      row.valid[c] = isValid ? 1 : 0
    }
  }

  return rows
}

function isoSeconds(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000).toISOString().slice(0, 19) + 'Z'
}

/**
 * Valid landing windows of one row computed with a one-hour column step: maximal runs of valid columns,
 * from the first to the last valid landing time. Same result as `findWindows`, but from the
 * prefix-sum evaluation of `computeWindowMap` (about 100 times faster over a two-year coverage).
 */
export function windowsFromRow(row: WindowMapRow): LandingWindow[] {
  const out: LandingWindow[] = []
  let runStart = -1
  for (let c = 0; c <= row.count; c++) {
    const ok = c < row.count && row.valid[c] === 1
    if (ok && runStart === -1) runStart = c
    if (!ok && runStart !== -1) {
      out.push({
        start_utc: isoSeconds(row.startMs + runStart * row.stepMs),
        end_utc: isoSeconds(row.startMs + (c - 1) * row.stepMs),
      })
      runStart = -1
    }
  }
  return out
}
