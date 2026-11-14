import type { EphemFile } from '../lib/types'
import { ephemCoverage } from '../lib/ephem'
import { normalizeAz } from '../lib/horizon'

export interface OffsetM {
  eastM: number
  northM: number
}

export interface ClampResult {
  offset: OffsetM
  clamped: boolean
}

export interface LegendRange {
  min: number
  max: number
}

/** 5 reference RGB points defining the perceptually uniform, colour-blind-safe Viridis ramp. */
export const VIRIDIS_STOPS: readonly (readonly [number, number, number])[] = [
  [68, 1, 84], // 0.00: deep purple #440154
  [59, 82, 139], // 0.25: blue #3b528b
  [33, 145, 140], // 0.50: teal #21918c
  [94, 201, 98], // 0.75: green #5ec962
  [253, 231, 37], // 1.00: yellow #fde725
]

/** CSS linear-gradient built from VIRIDIS_STOPS, so legends match the heatmap texture. */
export function viridisGradientCss(): string {
  const n = VIRIDIS_STOPS.length - 1
  const parts = VIRIDIS_STOPS.map((c, i) => `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${Math.round((i / n) * 100)}%`)
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** Interpolate Viridis RGB for t in 0..1. */
export function viridisRgb(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t))
  const pos = clamped * (VIRIDIS_STOPS.length - 1)
  const i = Math.floor(pos)
  if (i >= VIRIDIS_STOPS.length - 1) {
    const last = VIRIDIS_STOPS[VIRIDIS_STOPS.length - 1]
    return [last[0], last[1], last[2]]
  }
  const frac = pos - i
  const c0 = VIRIDIS_STOPS[i]
  const c1 = VIRIDIS_STOPS[i + 1]
  return [
    Math.round(c0[0] + frac * (c1[0] - c0[0])),
    Math.round(c0[1] + frac * (c1[1] - c0[1])),
    Math.round(c0[2] + frac * (c1[2] - c0[2])),
  ]
}

/**
 * Clamps lander offset to the patch interior.
 * When offset is constrained by the margin, clamped is true.
 */
export function clampLanderOffset(
  offset: OffsetM,
  sizePx: number,
  spacingM: number,
  marginM: number = spacingM * 2,
): ClampResult {
  const halfSpan = (sizePx / 2) * spacingM
  const maxM = Math.max(0, halfSpan - marginM)
  const minM = -maxM

  const eastM = Math.max(minM, Math.min(maxM, offset.eastM))
  const northM = Math.max(minM, Math.min(maxM, offset.northM))

  const clamped = eastM !== offset.eastM || northM !== offset.northM
  return {
    offset: { eastM, northM },
    clamped,
  }
}

/**
 * Formats delta hours with sign, exactly one decimal place, and 'h' unit.
 * E.g. '+1.5 h', '-0.8 h', '+0.0 h'.
 */
export function formatDeltaHours(deltaH: number): string {
  if (Math.abs(deltaH) < 0.05) {
    return '+0.0 h'
  }
  const sign = deltaH > 0 ? '+' : ''
  return `${sign}${deltaH.toFixed(1)} h`
}

/**
 * Finds min and max non-NaN values in a Float32Array grid.
 * Falls back to 0..100 if empty or all-NaN.
 */
export function legendRange(grid: Float32Array): LegendRange {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]
    if (!Number.isNaN(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 100 }
  }
  return { min, max }
}

/** Format offset as human readable string with direction signs. */
export function formatOffset(offset: OffsetM): string {
  const dist = Math.round(Math.hypot(offset.eastM, offset.northM))
  const eSign = offset.eastM >= 0 ? '+' : ''
  const nSign = offset.northM >= 0 ? '+' : ''
  return `${dist} m (${eSign}${Math.round(offset.eastM)} m E, ${nSign}${Math.round(offset.northM)} m N)`
}

/** Bilinear interpolation in horizon mask for ArrayLike<number> (Float32Array or number[]). */
export function horizonElevationAt(
  mask: ArrayLike<number>,
  azStepDeg: number,
  azDeg: number,
): number {
  const n = mask.length
  if (n === 0) return 0
  if (n === 1 || azStepDeg <= 0) return mask[0]
  const az = normalizeAz(azDeg)
  const indexFloat = az / azStepDeg
  let i0 = Math.floor(indexFloat)
  const frac = indexFloat - i0
  i0 = ((i0 % n) + n) % n
  const i1 = (i0 + 1) % n
  return mask[i0] + frac * (mask[i1] - mask[i0])
}

/**
 * Computes Sun visible hours for a given horizon mask over the window [startMs, endMs).
 * Evaluates geometric visibility (Sun centre at or above the horizon).
 */
export function computeSunVisibleHours(
  ephem: EphemFile,
  mask: ArrayLike<number>,
  azStepDeg: number,
  startMs: number,
  endMs: number,
): number | null {
  if (ephem.count <= 0 || startMs >= endMs || mask.length === 0) {
    return null
  }
  const { startMs: startMsCov } = ephemCoverage(ephem)
  const stepMs = ephem.step_minutes * 60_000
  if (stepMs <= 0 || Number.isNaN(startMsCov)) {
    return null
  }

  let kStart = Math.max(0, Math.floor((startMs - startMsCov) / stepMs))
  while (kStart < ephem.count && startMsCov + kStart * stepMs < startMs) {
    kStart++
  }
  let kEnd = Math.min(
    ephem.count,
    Math.ceil((endMs - startMsCov) / stepMs) + 1,
  )
  while (kEnd > kStart && startMsCov + (kEnd - 1) * stepMs >= endMs) {
    kEnd--
  }

  const sampleCount = kEnd - kStart
  if (sampleCount <= 0) {
    return null
  }

  let countSunlit = 0
  for (let k = kStart; k < kEnd; k++) {
    const az = ephem.sun.az[k]
    const el = ephem.sun.el[k]
    const hEl = horizonElevationAt(mask, azStepDeg, az)
    if (el - hEl >= 0) {
      countSunlit++
    }
  }

  const stepH = ephem.step_minutes / 60
  return countSunlit * stepH
}

/**
 * Returns grid coordinates (row, col, index) for an ENU offset in a centered square grid.
 * Returns null if outside the grid.
 */
export function cellIndexAt(
  eastM: number,
  northM: number,
  extentM: number,
  gridN: number,
): { row: number; col: number; index: number } | null {
  if (gridN <= 0 || extentM <= 0) return null
  const half = extentM / 2
  const cellSize = extentM / gridN
  const col = Math.floor((eastM + half) / cellSize)
  const row = Math.floor((half - northM) / cellSize)
  if (col < 0 || col >= gridN || row < 0 || row >= gridN) {
    return null
  }
  return { row, col, index: row * gridN + col }
}
