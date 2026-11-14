import type { OffsetM } from './landerHelpers'
import { heightAt } from './terrain'

export const COMPASS_POINTS_8 = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const

export type CompassPoint8 = (typeof COMPASS_POINTS_8)[number]

/**
 * Converts azimuth degrees (clockwise from North, 0..360) to 8-point compass word.
 */
export function compassDirection8(azDeg: number): CompassPoint8 {
  const norm = ((azDeg % 360) + 360) % 360
  const index = Math.round(norm / 45) % 8
  return COMPASS_POINTS_8[index]
}

/**
 * Calculates the slope in degrees at cell (i, j) on a terrain height grid with cellSizeM.
 * Supports both 2D grids (grid[i][j]) and 1D flat square grids (grid[i * N + j]).
 */
export function slopeDeg(
  grid: ArrayLike<ArrayLike<number>> | ArrayLike<number>,
  i: number,
  j: number,
  cellSizeM: number,
): number {
  if (cellSizeM <= 0 || grid.length === 0) {
    return 0
  }

  const is2D =
    typeof (grid as ArrayLike<unknown>)[0] === 'object' &&
    (grid as ArrayLike<unknown>)[0] !== null

  let numRows: number
  let numCols: number
  let getVal: (r: number, c: number) => number

  if (is2D) {
    const grid2D = grid as ArrayLike<ArrayLike<number>>
    numRows = grid2D.length
    numCols = grid2D[0]?.length ?? 0
    getVal = (r, c) => grid2D[r]?.[c] ?? 0
  } else {
    const grid1D = grid as ArrayLike<number>
    const n = Math.round(Math.sqrt(grid1D.length))
    numRows = n
    numCols = n
    getVal = (r, c) => grid1D[r * n + c] ?? 0
  }

  if (numRows <= 0 || numCols <= 0 || i < 0 || i >= numRows || j < 0 || j >= numCols) {
    return 0
  }

  let dfx = 0
  if (numCols > 1) {
    if (j === 0) {
      dfx = (getVal(i, 1) - getVal(i, 0)) / cellSizeM
    } else if (j === numCols - 1) {
      dfx = (getVal(i, numCols - 1) - getVal(i, numCols - 2)) / cellSizeM
    } else {
      dfx = (getVal(i, j + 1) - getVal(i, j - 1)) / (2 * cellSizeM)
    }
  }

  let dfy = 0
  if (numRows > 1) {
    if (i === 0) {
      dfy = (getVal(0, j) - getVal(1, j)) / cellSizeM
    } else if (i === numRows - 1) {
      dfy = (getVal(numRows - 2, j) - getVal(numRows - 1, j)) / cellSizeM
    } else {
      dfy = (getVal(i - 1, j) - getVal(i + 1, j)) / (2 * cellSizeM)
    }
  }

  const grad = Math.hypot(dfx, dfy)
  return (Math.atan(grad) * 180) / Math.PI
}

/**
 * Clamps search radius so it never extends beyond the terrain patch margin.
 */
export function clampSearchRadius(
  radiusM: number,
  sizePx: number,
  spacingM: number,
  marginM: number = spacingM * 2,
): number {
  const halfSpan = (sizePx / 2) * spacingM
  const maxM = Math.max(0, halfSpan - marginM)
  return Math.max(0, Math.min(radiusM, maxM))
}

/**
 * Formats the planner moment result sentence:
 * "Moved 340 m to the north-east. Sun visible: 412 h here vs 351 h at the original point (+61 h)."
 * Direction is an 8-point compass word, distance rounded to 10 m, signed delta.
 */
export function formatResultSentence(
  offset: OffsetM,
  hereHours: number,
  origHours: number,
): string {
  const dist = Math.hypot(offset.eastM, offset.northM)
  const roundedDist = Math.round(dist / 10) * 10
  const roundedHere = Math.round(hereHours)
  const roundedOrig = Math.round(origHours)
  const delta = (roundedHere - roundedOrig) || 0
  const sign = delta >= 0 ? '+' : ''
  const deltaStr = `${sign}${delta} h`

  if (roundedDist === 0) {
    return `Moved 0 m. Sun visible: ${roundedHere} h here vs ${roundedOrig} h at the original point (${deltaStr}).`
  }

  const azDeg = (Math.atan2(offset.eastM, offset.northM) * 180) / Math.PI
  const dir = compassDirection8(azDeg)

  return `Moved ${roundedDist} m to the ${dir}. Sun visible: ${roundedHere} h here vs ${roundedOrig} h at the original point (${deltaStr}).`
}

/**
 * Plain one-sentence result for Simple mode. Uses only the gain, so two baselines are never shown.
 */
export function formatSimpleResultSentence(offset: OffsetM, gainHours: number): string {
  const dist = Math.hypot(offset.eastM, offset.northM)
  const gain = Math.round(gainHours)
  if (gain <= 0 || dist < 5) return 'The current spot is already among the sunniest nearby.'
  const azDeg = (Math.atan2(offset.eastM, offset.northM) * 180) / Math.PI
  const dir = compassDirection8(azDeg)
  const distText =
    dist >= 950 ? `${String(Math.round(dist / 100) / 10)} km` : `${String(Math.max(10, Math.round(dist / 10) * 10))} m`
  return `Moving ${distText} ${dir} would give about ${String(gain)} more ${gain === 1 ? 'hour' : 'hours'} of Sun in this window.`
}

/**
 * Samples terrain heights at cell centres for a gridN x gridN grid covering extentM.
 */
export function buildCellHeightGrid(
  heights: Float32Array,
  sizePx: number,
  spacingM: number,
  gridN: number,
  extentM: number,
): Float32Array {
  const out = new Float32Array(gridN * gridN)
  const cellSize = extentM / gridN
  const halfExtent = extentM / 2

  for (let r = 0; r < gridN; r++) {
    const y = halfExtent - (r + 0.5) * cellSize
    const rowOffset = r * gridN
    for (let c = 0; c < gridN; c++) {
      const x = -halfExtent + (c + 0.5) * cellSize
      out[rowOffset + c] = heightAt(heights, sizePx, spacingM, x, y) ?? 0
    }
  }

  return out
}

export interface BestSpotSearchInput {
  sunlitGrid: ArrayLike<number> // row-major gridN x gridN (Sun-visible fraction 0..100 or hours)
  heightGrid: ArrayLike<ArrayLike<number>> | ArrayLike<number> // heights for slope computation
  gridN: number
  extentM: number
  radiusM: number
  sizePx?: number
  spacingM?: number
  maxSlopeDeg?: number // default 10
}

export interface BestSpotResult {
  row: number
  col: number
  index: number
  offset: OffsetM
  distanceM: number
  sunlitVal: number
  slopeDeg: number
}

/**
 * Searches cells inside clamped patch interior and radius selector.
 * Picks the cell with highest Sun-visible hours; ties go to cell closest to original site.
 * Requires cell to be flat enough (slope under 10 degrees).
 * Returns null if no cell qualifies.
 */
export function argmaxBestSpot(input: BestSpotSearchInput): BestSpotResult | null {
  const {
    sunlitGrid,
    heightGrid,
    gridN,
    extentM,
    radiusM,
    sizePx,
    spacingM,
    maxSlopeDeg = 10,
  } = input

  if (gridN <= 0 || extentM <= 0 || radiusM <= 0) {
    return null
  }

  const cellSize = extentM / gridN
  const halfExtent = extentM / 2

  // Determine clamped patch interior limit if sizePx and spacingM are provided
  const maxPatchM =
    sizePx !== undefined && spacingM !== undefined
      ? Math.max(0, (sizePx / 2) * spacingM - 2 * spacingM)
      : halfExtent

  const effectiveRadiusM = Math.min(radiusM, maxPatchM)

  let best: BestSpotResult | null = null

  for (let r = 0; r < gridN; r++) {
    const y = halfExtent - (r + 0.5) * cellSize
    const rowOffset = r * gridN

    for (let c = 0; c < gridN; c++) {
      const x = -halfExtent + (c + 0.5) * cellSize
      const idx = rowOffset + c

      const val = sunlitGrid[idx]
      if (val === undefined || Number.isNaN(val)) {
        continue
      }

      // Check patch interior boundary
      if (Math.abs(x) > maxPatchM || Math.abs(y) > maxPatchM) {
        continue
      }

      // Check search radius
      const dist = Math.hypot(x, y)
      if (dist > effectiveRadiusM) {
        continue
      }

      // Check slope
      const slope = slopeDeg(heightGrid, r, c, cellSize)
      if (slope >= maxSlopeDeg) {
        continue
      }

      // Argmax with tie rule: ties go to cell closest to original site (0, 0)
      if (best === null) {
        best = {
          row: r,
          col: c,
          index: idx,
          offset: { eastM: Math.round(x), northM: Math.round(y) },
          distanceM: dist,
          sunlitVal: val,
          slopeDeg: slope,
        }
      } else {
        const diff = val - best.sunlitVal
        if (diff > 1e-5) {
          best = {
            row: r,
            col: c,
            index: idx,
            offset: { eastM: Math.round(x), northM: Math.round(y) },
            distanceM: dist,
            sunlitVal: val,
            slopeDeg: slope,
          }
        } else if (Math.abs(diff) <= 1e-5) {
          // Tie: prefer cell closest to original site
          if (dist < best.distanceM - 1e-3) {
            best = {
              row: r,
              col: c,
              index: idx,
              offset: { eastM: Math.round(x), northM: Math.round(y) },
              distanceM: dist,
              sunlitVal: val,
              slopeDeg: slope,
            }
          }
        }
      }
    }
  }

  return best
}
