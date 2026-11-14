import type { ObserverHeightM, SiteBundle } from '../../lib/types'
import { ephemCoverage, sampleAt } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import { pickMaskFor } from '../../lib/metrics'

export type RangeMode = '24h' | '7d' | 'window'

export interface RangeBounds {
  startH: number
  endH: number
}

export interface ElevationPoint {
  relH: number
  timeMs: number
  utcIso: string
  sunClearanceDeg: number
  earthClearanceDeg: number
  sunElDeg: number
  earthElDeg: number
  sunHorizonElDeg: number
  earthHorizonElDeg: number
  sunVisible: boolean
  earthVisible: boolean
}

const HOUR_MS = 3_600_000

/**
 * Computes the view bounds [startH, endH] in hours for a chosen range around cursorH.
 */
export function computeRangeBounds(
  cursorH: number,
  durationH: number,
  rangeMode: RangeMode,
): RangeBounds {
  const safeDuration = Number.isFinite(durationH) && durationH > 0 ? durationH : 1
  const safeCursor = Number.isFinite(cursorH) ? Math.max(0, Math.min(cursorH, safeDuration)) : 0

  if (rangeMode === 'window') {
    return { startH: 0, endH: safeDuration }
  }

  const spanH = rangeMode === '24h' ? 24 : 168 // 7 days = 168 hours
  if (safeDuration <= spanH) {
    return { startH: 0, endH: safeDuration }
  }

  const halfSpan = spanH / 2
  const idealStart = safeCursor - halfSpan
  const startH = Math.max(0, Math.min(idealStart, safeDuration - spanH))
  const endH = startH + spanH

  return { startH, endH }
}

/** Formats an epoch millisecond timestamp to "YYYY-MM-DD HH:mm UTC". */
export function formatUtcDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`
}

/** Formats elevation in degrees with explicit sign and unit. */
export function formatElevationDeg(deg: number): string {
  if (!Number.isFinite(deg)) return '—'
  const rounded = Math.round(deg * 10) / 10
  const prefix = rounded > 0 ? '+' : ''
  return `${prefix}${rounded.toFixed(1)}°`
}

/** Status wording: only "Sun visible" and "Sun below horizon". */
export function sunStatusText(visible: boolean): 'Sun visible' | 'Sun below horizon' {
  return visible ? 'Sun visible' : 'Sun below horizon'
}

/** Status wording: only "Earth in view" and "Earth below horizon". */
export function earthStatusText(visible: boolean): 'Earth in view' | 'Earth below horizon' {
  return visible ? 'Earth in view' : 'Earth below horizon'
}

/**
 * Samples a single point at a specific millisecond timestamp.
 */
export function sampleElevationAt(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: ObserverHeightM | number,
  timeMs: number,
  baseStartMs: number,
): ElevationPoint | null {
  const sample = sampleAt(bundle.ephem, timeMs)
  if (!sample) return null

  const mask = pickMaskFor(bundle.horizon, observerHeightM)
  const azStep = bundle.horizon.az_step_deg

  const sunHorizonElDeg = horizonAt(mask, azStep, sample.sun.az)
  const sunClearanceDeg = sample.sun.el - sunHorizonElDeg

  const earthHorizonElDeg = horizonAt(mask, azStep, sample.earth.az)
  const earthClearanceDeg = sample.earth.el - earthHorizonElDeg

  const relH = Math.max(0, (timeMs - baseStartMs) / HOUR_MS)

  return {
    relH,
    timeMs,
    utcIso: formatUtcDateTime(timeMs),
    sunClearanceDeg,
    earthClearanceDeg,
    sunElDeg: sample.sun.el,
    earthElDeg: sample.earth.el,
    sunHorizonElDeg,
    earthHorizonElDeg,
    sunVisible: sunClearanceDeg >= 0,
    earthVisible: earthClearanceDeg >= 0,
  }
}

/**
 * Computes hourly elevation points across a range [startH, endH].
 */
export function computeElevationSeries(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: ObserverHeightM | number,
  windowStartMs: number,
  startH: number,
  endH: number,
): ElevationPoint[] {
  const { ephem } = bundle
  if (ephem.count <= 0 || endH < startH) return []

  const cov = ephemCoverage(ephem)
  const clampedStartH = Math.max(0, startH)
  const totalHours = Math.floor(endH - clampedStartH)
  const points: ElevationPoint[] = []

  for (let i = 0; i <= totalHours; i++) {
    const currentH = clampedStartH + i
    const timeMs = windowStartMs + currentH * HOUR_MS
    if (timeMs < cov.startMs || timeMs > cov.endMs) continue

    const pt = sampleElevationAt(bundle, observerHeightM, timeMs, windowStartMs)
    if (pt) {
      points.push(pt)
    }
  }

  // If endH is not an integer hour, include the end point
  if (endH > clampedStartH + totalHours) {
    const timeMs = windowStartMs + endH * HOUR_MS
    if (timeMs >= cov.startMs && timeMs <= cov.endMs) {
      const pt = sampleElevationAt(bundle, observerHeightM, timeMs, windowStartMs)
      if (pt) points.push(pt)
    }
  }

  return points
}

/**
 * Limits table rows to at most maxRows (default 200).
 */
export function limitTableRows(
  series: readonly ElevationPoint[],
  maxRows = 200,
): ElevationPoint[] {
  if (series.length <= maxRows) return [...series]
  return series.slice(0, maxRows)
}
