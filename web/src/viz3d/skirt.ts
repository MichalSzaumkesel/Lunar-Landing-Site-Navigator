import { horizonAt } from '../lib/horizon'

// Far-horizon skirt: a ring wall whose top edge follows the site's horizon mask. The terrain patch
// is only a few km wide, its edge is lower than the real horizon (the mask reaches 100 to 150 km),
// so without the wall a body below the mask would show above the patch edge.

export const SKIRT_SEGMENTS = 720
export const SKIRT_BOTTOM_EL_DEG = -40

/** Horizon elevation in degrees at an azimuth (from north, clockwise; wraps at 360), interpolated. */
export function skirtElevationAt(mask: readonly number[], azStepDeg: number, azDeg: number): number {
  return horizonAt(mask, azStepDeg, azDeg)
}

/** A body is visible over the horizon iff its centre is at or above the mask (clearance >= 0). */
export function bodyClearsHorizon(
  mask: readonly number[],
  azStepDeg: number,
  azDeg: number,
  elDeg: number,
): boolean {
  return elDeg - skirtElevationAt(mask, azStepDeg, azDeg) >= 0
}

/** Mask elevations at `segments + 1` evenly spaced azimuths; the last repeats the first so the ring closes. */
export function skirtProfile(
  mask: readonly number[],
  azStepDeg: number,
  segments = SKIRT_SEGMENTS,
): Float32Array {
  const out = new Float32Array(segments + 1)
  for (let i = 0; i <= segments; i++) {
    out[i] = skirtElevationAt(mask, azStepDeg, (i / segments) * 360)
  }
  return out
}

/**
 * Wall vertices in three.js order (x east, y up, z south), relative to the observer: for every
 * azimuth a top vertex on the mask and a bottom vertex under the horizon, at horizontal radius `radius`.
 */
export function skirtPositions(profile: Float32Array, radius: number): Float32Array {
  const segments = profile.length - 1
  const out = new Float32Array((segments + 1) * 2 * 3)
  const bottomY = radius * Math.tan((SKIRT_BOTTOM_EL_DEG * Math.PI) / 180)
  for (let i = 0; i <= segments; i++) {
    const az = (i / segments) * 2 * Math.PI
    const x = radius * Math.sin(az)
    const z = -radius * Math.cos(az)
    const top = radius * Math.tan((profile[i] * Math.PI) / 180)
    const o = i * 6
    out[o] = x
    out[o + 1] = top
    out[o + 2] = z
    out[o + 3] = x
    out[o + 4] = bottomY
    out[o + 5] = z
  }
  return out
}
