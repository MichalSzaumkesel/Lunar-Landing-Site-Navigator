import { heightAt } from './terrain'

export const R_MOON_M = 1_737_400

export interface HorizonOptions {
  rays?: number
  maxRangeM?: number
  stepM?: number
}

/** Horizon elevation in degrees for `rays` azimuths (default 720, azimuth i * 360 / rays from north, clockwise) seen from the ENU position (xM, yM) at observerHeightM above the ground there. */
export function horizonFromTerrain(
  heights: Float32Array,
  sizePx: number,
  spacingM: number,
  xM: number,
  yM: number,
  observerHeightM: number,
  opts?: HorizonOptions,
): Float32Array {
  const groundH = heightAt(heights, sizePx, spacingM, xM, yM)
  if (groundH === null) {
    throw new Error(`Observer position (${xM}, ${yM}) is outside the terrain grid`)
  }

  const rays = opts?.rays ?? 720
  if (rays <= 0) {
    return new Float32Array(0)
  }

  const stepM = opts?.stepM ?? spacingM
  if (stepM <= 0) {
    throw new Error(`stepM must be positive, got ${stepM}`)
  }

  const maxRangeM = opts?.maxRangeM ?? Infinity
  const z0 = groundH + observerHeightM
  const out = new Float32Array(rays)

  const radToDeg = 180 / Math.PI
  const degToRad = Math.PI / 180
  const inv2R = 1 / (2 * R_MOON_M)
  const azStepDeg = 360 / rays
  const defaultDip =
    -Math.acos(Math.min(1, Math.max(-1, R_MOON_M / (R_MOON_M + observerHeightM)))) *
    radToDeg

  for (let i = 0; i < rays; i++) {
    const azRad = i * azStepDeg * degToRad
    const sinAz = Math.sin(azRad)
    const cosAz = Math.cos(azRad)

    let maxAngleRad = -Infinity
    let sampleCount = 0

    for (let d = stepM; d <= maxRangeM + 1e-5; d += stepM) {
      const x = xM + d * sinAz
      const y = yM + d * cosAz
      const h = heightAt(heights, sizePx, spacingM, x, y)
      if (h === null) {
        break
      }
      sampleCount++
      const angleRad = Math.atan2(h - z0 - d * d * inv2R, d)
      if (angleRad > maxAngleRad) {
        maxAngleRad = angleRad
      }
    }

    out[i] = sampleCount === 0 ? defaultDip : maxAngleRad * radToDeg
  }

  return out
}
