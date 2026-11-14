import { hash2, mulberry32 } from './noise'

// Deterministic, world-anchored scatter of decoration (rocks, crater rims). The plane is cut into
// square cells; every cell derives its items from a hash of (cell, seed), so the same rock is
// always at the same place however the centre moves. Decoration only: not data.

export interface ScatterSpec {
  seed: number
  cellM: number
  radiusM: number
  /** Candidates per cell before the distance falloff. */
  perCell: number
  minSize: number
  maxSize: number
  /** Larger values make small items more common. */
  sizeBias: number
  /** Distance at which the keep probability has dropped to one half. */
  falloffM: number
  maxCount: number
}

export interface ScatterItem {
  eastM: number
  northM: number
  size: number
  yawRad: number
  /** Random 0..1 for tint and shape variety. */
  tone: number
  distM: number
}

export function scatterItems(centerE: number, centerN: number, spec: ScatterSpec): ScatterItem[] {
  const { cellM, radiusM } = spec
  const i0 = Math.floor((centerE - radiusM) / cellM)
  const i1 = Math.floor((centerE + radiusM) / cellM)
  const j0 = Math.floor((centerN - radiusM) / cellM)
  const j1 = Math.floor((centerN + radiusM) / cellM)
  const out: ScatterItem[] = []
  const logRatio = Math.log(spec.maxSize / spec.minSize)
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const rnd = mulberry32(Math.floor(hash2(i, j, spec.seed) * 4294967296))
      for (let k = 0; k < spec.perCell; k++) {
        // Draw every value even when the candidate is dropped, so items do not depend on the centre.
        const e = (i + rnd()) * cellM
        const n = (j + rnd()) * cellM
        const keep = rnd()
        const sizeU = rnd()
        const yawRad = rnd() * Math.PI * 2
        const tone = rnd()
        const dE = e - centerE
        const dN = n - centerN
        const distM = Math.hypot(dE, dN)
        if (distM > radiusM) continue
        const q = distM / spec.falloffM
        if (keep > 1 / (1 + q * q)) continue
        const size = spec.minSize * Math.exp(logRatio * Math.pow(sizeU, spec.sizeBias))
        out.push({ eastM: e, northM: n, size, yawRad, tone, distM })
      }
    }
  }
  out.sort((a, b) => a.distM - b.distM)
  if (out.length > spec.maxCount) out.length = spec.maxCount
  return out
}

export const SMALL_ROCKS: Omit<ScatterSpec, 'maxCount'> = {
  seed: 11,
  cellM: 8,
  radiusM: 260,
  perCell: 3,
  minSize: 0.08,
  maxSize: 0.9,
  sizeBias: 2.2,
  falloffM: 90,
}

export const BOULDERS: Omit<ScatterSpec, 'maxCount'> = {
  seed: 23,
  cellM: 90,
  radiusM: 5000,
  perCell: 3,
  minSize: 1.2,
  maxSize: 7,
  sizeBias: 2.4,
  falloffM: 2600,
}

export const CRATER_RIMS: Omit<ScatterSpec, 'maxCount'> = {
  seed: 37,
  cellM: 120,
  radiusM: 3500,
  perCell: 2,
  minSize: 4,
  maxSize: 40,
  sizeBias: 2.0,
  falloffM: 2200,
}
