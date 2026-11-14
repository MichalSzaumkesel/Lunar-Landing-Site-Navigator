import { angularSeparationDeg } from './earthPhase'
import type { EphemFile } from './types'

export interface Eclipse {
  startMs: number
  endMs: number
  maxOverlapFraction: number
  minSeparationDeg: number
}

/**
 * Geometric overlap of the Earth and Sun discs seen from a lunar site.
 *
 * Note: Terrain obstruction is ignored on purpose; eclipses represent geometric overlap
 * of the Sun and Earth discs as seen from the site coordinates regardless of whether the
 * bodies are above or below the local horizon.
 */
export function listEclipses(
  ephem: EphemFile,
  startMs: number,
  endMs: number,
): Eclipse[] {
  if (ephem.count <= 0 || startMs >= endMs) {
    return []
  }

  const ephemStartMs = Date.parse(ephem.start_utc)
  const stepMs = ephem.step_minutes * 60_000
  if (stepMs <= 0 || Number.isNaN(ephemStartMs)) {
    return []
  }

  const rSun = ephem.sun_ang_radius_deg
  const rEarth = ephem.earth_ang_radius_deg
  const rSum = rSun + rEarth

  const eclipses: Eclipse[] = []
  let curStartMs: number | null = null
  let curLastSampleMs: number | null = null
  let curMaxOverlap = 0
  let curMinSeparation = Infinity

  for (let k = 0; k < ephem.count; k++) {
    const tK = ephemStartMs + k * stepMs
    if (tK < startMs || tK >= endMs) {
      if (curStartMs !== null && curLastSampleMs !== null) {
        eclipses.push({
          startMs: curStartMs,
          endMs: Math.min(endMs, curLastSampleMs + stepMs),
          maxOverlapFraction: curMaxOverlap,
          minSeparationDeg: curMinSeparation,
        })
        curStartMs = null
        curLastSampleMs = null
        curMaxOverlap = 0
        curMinSeparation = Infinity
      }
      if (tK >= endMs) {
        break
      }
      continue
    }

    const sunPos = { az: ephem.sun.az[k], el: ephem.sun.el[k] }
    const earthPos = { az: ephem.earth.az[k], el: ephem.earth.el[k] }
    const sep = angularSeparationDeg(sunPos, earthPos)

    if (sep < rSum) {
      const frac = rSun > 0 ? Math.max(0, Math.min(1, (rSun + rEarth - sep) / (2 * rSun))) : 0

      if (curStartMs === null) {
        curStartMs = tK
        curLastSampleMs = tK
        curMaxOverlap = frac
        curMinSeparation = sep
      } else if (curLastSampleMs !== null && tK === curLastSampleMs + stepMs) {
        curLastSampleMs = tK
        if (frac > curMaxOverlap) curMaxOverlap = frac
        if (sep < curMinSeparation) curMinSeparation = sep
      } else {
        // Discontinuous time jump
        eclipses.push({
          startMs: curStartMs,
          endMs: Math.min(endMs, curLastSampleMs! + stepMs),
          maxOverlapFraction: curMaxOverlap,
          minSeparationDeg: curMinSeparation,
        })
        curStartMs = tK
        curLastSampleMs = tK
        curMaxOverlap = frac
        curMinSeparation = sep
      }
    } else if (curStartMs !== null && curLastSampleMs !== null) {
      eclipses.push({
        startMs: curStartMs,
        endMs: Math.min(endMs, curLastSampleMs + stepMs),
        maxOverlapFraction: curMaxOverlap,
        minSeparationDeg: curMinSeparation,
      })
      curStartMs = null
      curLastSampleMs = null
      curMaxOverlap = 0
      curMinSeparation = Infinity
    }
  }

  if (curStartMs !== null && curLastSampleMs !== null) {
    eclipses.push({
      startMs: curStartMs,
      endMs: Math.min(endMs, curLastSampleMs + stepMs),
      maxOverlapFraction: curMaxOverlap,
      minSeparationDeg: curMinSeparation,
    })
  }

  return eclipses
}
