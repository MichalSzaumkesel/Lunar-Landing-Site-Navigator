import type { ObserverHeightM, SiteBundle } from '../../lib/types'
import { sampleAt } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import { bodyFraction } from '../../lib/metrics'
import { pickMask } from '../sky/geometry'

export type ChartRange = '24h' | '7d' | 'window'

export interface ElevationPoint {
  tMs: number
  utc: string
  hoursFromStart: number
  sunClearance: number
  earthClearance: number
  sunEl: number
  earthEl: number
  sunHorizonEl: number
  earthHorizonEl: number
  sunVisible: boolean
  earthVisible: boolean
}

/** Computes hourly elevation-above-horizon clearance series for Sun and Earth across the scenario window. */
export function computeElevationSeries(
  bundle: Pick<SiteBundle, 'ephem' | 'horizon'>,
  observerHeightM: ObserverHeightM,
  startMs: number,
  endMs: number,
  stepMinutes: number = 60,
): ElevationPoint[] {
  const points: ElevationPoint[] = []
  if (endMs < startMs || !bundle.ephem || bundle.ephem.count <= 0) {
    return points
  }

  const mask = pickMask(bundle, observerHeightM)
  const azStepDeg = bundle.horizon.az_step_deg
  const sunRadiusDeg = bundle.ephem.sun_ang_radius_deg
  const earthRadiusDeg = bundle.ephem.earth_ang_radius_deg
  const stepMs = Math.max(1, stepMinutes) * 60_000

  for (let tMs = startMs; tMs <= endMs; tMs += stepMs) {
    const sample = sampleAt(bundle.ephem, tMs)
    if (!sample) continue

    const sunHorizonEl = horizonAt(mask, azStepDeg, sample.sun.az)
    const sunClearance = sample.sun.el - sunHorizonEl
    const sunFrac = bodyFraction(sunClearance, sunRadiusDeg)

    const earthHorizonEl = horizonAt(mask, azStepDeg, sample.earth.az)
    const earthClearance = sample.earth.el - earthHorizonEl
    const earthFrac = bodyFraction(earthClearance, earthRadiusDeg)

    points.push({
      tMs,
      utc: new Date(tMs).toISOString().replace('.000Z', 'Z'),
      hoursFromStart: (tMs - startMs) / 3600_000,
      sunClearance,
      earthClearance,
      sunEl: sample.sun.el,
      earthEl: sample.earth.el,
      sunHorizonEl,
      earthHorizonEl,
      sunVisible: sunFrac >= 0.5,
      earthVisible: earthFrac >= 0.5,
    })
  }

  // Ensure endMs point is present if not an exact multiple of stepMs
  const last = points[points.length - 1]
  if (last && last.tMs < endMs) {
    const sample = sampleAt(bundle.ephem, endMs)
    if (sample) {
      const sunHorizonEl = horizonAt(mask, azStepDeg, sample.sun.az)
      const sunClearance = sample.sun.el - sunHorizonEl
      const sunFrac = bodyFraction(sunClearance, sunRadiusDeg)

      const earthHorizonEl = horizonAt(mask, azStepDeg, sample.earth.az)
      const earthClearance = sample.earth.el - earthHorizonEl
      const earthFrac = bodyFraction(earthClearance, earthRadiusDeg)

      points.push({
        tMs: endMs,
        utc: new Date(endMs).toISOString().replace('.000Z', 'Z'),
        hoursFromStart: (endMs - startMs) / 3600_000,
        sunClearance,
        earthClearance,
        sunEl: sample.sun.el,
        earthEl: sample.earth.el,
        sunHorizonEl,
        earthHorizonEl,
        sunVisible: sunFrac >= 0.5,
        earthVisible: earthFrac >= 0.5,
      })
    }
  }

  return points
}

/** Determines active timestamp boundaries centered around cursor, clamped to scenario window. */
export function getTimeRange(
  range: ChartRange,
  cursorMs: number,
  startMs: number,
  endMs: number,
): { rangeStartMs: number; rangeEndMs: number } {
  if (range === 'window' || endMs <= startMs) {
    return { rangeStartMs: startMs, rangeEndMs: endMs }
  }

  const spanMs = range === '24h' ? 24 * 3600_000 : 7 * 24 * 3600_000
  const totalSpan = endMs - startMs
  if (totalSpan <= spanMs) {
    return { rangeStartMs: startMs, rangeEndMs: endMs }
  }

  const half = spanMs / 2
  let rStart = cursorMs - half
  let rEnd = cursorMs + half

  if (rStart < startMs) {
    rStart = startMs
    rEnd = startMs + spanMs
  } else if (rEnd > endMs) {
    rEnd = endMs
    rStart = endMs - spanMs
  }

  return {
    rangeStartMs: Math.max(startMs, rStart),
    rangeEndMs: Math.min(endMs, rEnd),
  }
}

/** Filters series data points to those within the specified time range. */
export function filterSeriesByRange(
  series: ElevationPoint[],
  rangeStartMs: number,
  rangeEndMs: number,
): ElevationPoint[] {
  return series.filter((p) => p.tMs >= rangeStartMs && p.tMs <= rangeEndMs)
}
