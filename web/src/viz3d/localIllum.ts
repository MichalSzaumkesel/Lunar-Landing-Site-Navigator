import type { EphemFile } from '../lib/types'
import { ephemCoverage } from '../lib/ephem'
import { normalizeAz } from '../lib/horizon'
import { heightAt } from './terrain'
import { horizonFromTerrain } from './terrainHorizon'

export interface LocalIllumInput {
  heights: Float32Array
  sizePx: number
  spacingM: number
  ephem: EphemFile
  observerHeightM: number
  startMs: number
  endMs: number // window of Sun samples to use, [startMs, endMs)
  gridN: number // gridN by gridN points
  extentM: number // the grid spans [-extentM/2, +extentM/2] east and north of the site, cell centres
  rays?: number // default 360
  onProgress?: (progress: number) => void
}

function horizonAtMask(mask: Float32Array, azStepDeg: number, azDeg: number): number {
  const n = mask.length
  if (n === 0) {
    return 0
  }
  if (n === 1) {
    return mask[0]
  }
  if (azStepDeg <= 0) {
    return mask[0]
  }

  const az = normalizeAz(azDeg)
  const indexFloat = az / azStepDeg
  let i0 = Math.floor(indexFloat)
  const frac = indexFloat - i0
  i0 = ((i0 % n) + n) % n
  const i1 = (i0 + 1) % n

  return mask[i0] + frac * (mask[i1] - mask[i0])
}

/** pct_sunlit (0..100) for each grid point, row-major from the north row to the south row, columns west to east. */
export function localSunlitGrid(input: LocalIllumInput): Float32Array {
  const {
    heights,
    sizePx,
    spacingM,
    ephem,
    observerHeightM,
    startMs,
    endMs,
    gridN,
    extentM,
  } = input

  if (gridN <= 0) {
    return new Float32Array(0)
  }

  const rays = input.rays ?? 360
  const azStepDeg = 360 / rays

  const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(ephem)
  const ephemStartMs = Date.parse(ephem.start_utc)
  const stepMs = ephem.step_minutes * 60_000

  // Filter ephemeris samples: sample time in [startMs, endMs) and inside coverage
  const azList: number[] = []
  const elList: number[] = []

  for (let k = 0; k < ephem.count; k++) {
    const t_k = ephemStartMs + k * stepMs
    if (t_k >= startMs && t_k < endMs && t_k >= covStartMs && t_k <= covEndMs) {
      azList.push(ephem.sun.az[k])
      elList.push(ephem.sun.el[k])
    }
  }

  const totalSamples = azList.length
  const sunAz = new Float64Array(azList)
  const sunEl = new Float64Array(elList)

  const out = new Float32Array(gridN * gridN)
  if (totalSamples === 0) {
    out.fill(Number.NaN)
    return out
  }
  const cellSize = extentM / gridN
  const halfExtent = extentM / 2

  for (let r = 0; r < gridN; r++) {
    if (input.onProgress) {
      input.onProgress(r / gridN)
    }
    const y = halfExtent - (r + 0.5) * cellSize
    const rowOffset = r * gridN
    for (let c = 0; c < gridN; c++) {
      const x = -halfExtent + (c + 0.5) * cellSize
      const idx = rowOffset + c

      if (heightAt(heights, sizePx, spacingM, x, y) === null) {
        out[idx] = Number.NaN
        continue
      }

      if (totalSamples === 0) {
        out[idx] = 0
        continue
      }

      let mask: Float32Array
      try {
        mask = horizonFromTerrain(heights, sizePx, spacingM, x, y, observerHeightM, {
          rays,
        })
      } catch {
        out[idx] = Number.NaN
        continue
      }

      let sunlitCount = 0
      for (let s = 0; s < totalSamples; s++) {
        const hEl = horizonAtMask(mask, azStepDeg, sunAz[s])
        if (sunEl[s] - hEl >= 0) {
          sunlitCount++
        }
      }

      out[idx] = (sunlitCount / totalSamples) * 100
    }
  }

  if (input.onProgress) {
    input.onProgress(1)
  }

  return out
}
