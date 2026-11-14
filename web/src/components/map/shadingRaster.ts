/**
 * Smooth night / Earth-not-in-view raster from coarse elevation grids.
 * Grids are row-major, row 0 = north, cell centres, lon -180..180 left to right (see lib/moonFrame.elevationGrid).
 */

export const SHADE_W = 360
export const SHADE_H = 180

const smooth = (t: number): number => t * t * (3 - 2 * t)
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Night opacity: 0 for a Sun more than 3 deg up, 0.72 for more than 3 deg down, soft in between (0.36 at the terminator). */
export function nightAlpha(sunElDeg: number): number {
  return 0.72 * smooth(clamp01((3 - sunElDeg) / 6))
}

/** Earth-not-in-view tint opacity. */
export function noEarthAlpha(earthElDeg: number): number {
  return 0.22 * smooth(clamp01((1.5 - earthElDeg) / 3))
}

/** Bilinear sample of a grid at output pixel centre (u, v) of a w x h raster; longitude wraps, latitude clamps. */
export function sampleGrid(
  grid: Float32Array,
  nLat: number,
  nLon: number,
  u: number,
  v: number,
  w: number,
  h: number,
): number {
  let gx = ((u + 0.5) / w) * nLon - 0.5
  let gy = ((v + 0.5) / h) * nLat - 0.5
  gy = Math.max(0, Math.min(nLat - 1, gy))
  const y0 = Math.floor(gy)
  const y1 = Math.min(nLat - 1, y0 + 1)
  const fy = gy - y0
  gx = ((gx % nLon) + nLon) % nLon
  const x0 = Math.floor(gx)
  const x1 = (x0 + 1) % nLon
  const fx = gx - x0
  const a = grid[y0 * nLon + x0] * (1 - fx) + grid[y0 * nLon + x1] * fx
  const b = grid[y1 * nLon + x0] * (1 - fx) + grid[y1 * nLon + x1] * fx
  return a * (1 - fy) + b * fy
}

/** Fills RGBA bytes (w*h*4, straight alpha) with night shading composited under a blue no-Earth tint. */
export function renderShading(
  out: Uint8ClampedArray,
  sunEl: Float32Array,
  earthEl: Float32Array,
  nLat: number,
  nLon: number,
  w = SHADE_W,
  h = SHADE_H,
): void {
  const NR = 5, NG = 8, NB = 16
  const ER = 70, EG = 140, EB = 230
  let p = 0
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const an = nightAlpha(sampleGrid(sunEl, nLat, nLon, u, v, w, h))
      const ae = noEarthAlpha(sampleGrid(earthEl, nLat, nLon, u, v, w, h))
      // "over" compositing: Earth tint on top of night
      const a = ae + an * (1 - ae)
      if (a <= 0.001) {
        out[p] = out[p + 1] = out[p + 2] = out[p + 3] = 0
      } else {
        out[p] = (ER * ae + NR * an * (1 - ae)) / a
        out[p + 1] = (EG * ae + NG * an * (1 - ae)) / a
        out[p + 2] = (EB * ae + NB * an * (1 - ae)) / a
        out[p + 3] = a * 255
      }
      p += 4
    }
  }
}
