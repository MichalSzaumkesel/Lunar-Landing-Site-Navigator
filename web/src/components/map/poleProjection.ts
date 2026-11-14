/**
 * South-polar stereographic projection on the Moon sphere (same CRS as the LOLA polar DEMs):
 * +proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m
 * Forward: rho = 2R tan(pi/4 + phi/2), x = rho sin(lon), y = rho cos(lon)  (lon 0 points to +y, lon 90E to +x).
 * Everything here is in projected metres with y UP; SVG code flips y.
 */

export const MOON_R_M = 1737400
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

export interface XY {
  x: number
  y: number
}

export function poleForward(latDeg: number, lonDeg: number): XY {
  const phi = Math.max(-90, Math.min(90, latDeg)) * D2R
  const lam = lonDeg * D2R
  const rho = 2 * MOON_R_M * Math.tan(Math.PI / 4 + phi / 2)
  return { x: rho * Math.sin(lam), y: rho * Math.cos(lam) }
}

export function poleInverse(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y)
  if (rho === 0) return { lat: -90, lon: 0 }
  const lam = Math.atan2(x, y)
  const phi = 2 * Math.atan(rho / (2 * MOON_R_M)) - Math.PI / 2
  let lon = lam * R2D
  if (lon > 180) lon -= 360
  if (lon <= -180) lon += 360
  return { lat: phi * R2D, lon }
}

/** Local scale factor of the projection (planar metres per ground metre). */
export function poleScale(latDeg: number): number {
  return 2 / (1 + Math.sin(Math.abs(latDeg) * D2R))
}

/**
 * Unit vectors of local east and north at a site, in projected (x, y-up) coordinates.
 * Derived numerically from the forward formula (north = d/dlat, east = d/dlon).
 */
export function poleLocalFrame(latDeg: number, lonDeg: number): { east: XY; north: XY } {
  const h = 1e-4
  const n0 = poleForward(latDeg - h, lonDeg)
  const n1 = poleForward(latDeg + h, lonDeg)
  const e0 = poleForward(latDeg, lonDeg - h)
  const e1 = poleForward(latDeg, lonDeg + h)
  const norm = (v: XY): XY => {
    const l = Math.hypot(v.x, v.y) || 1
    return { x: v.x / l, y: v.y / l }
  }
  return {
    north: norm({ x: n1.x - n0.x, y: n1.y - n0.y }),
    east: norm({ x: e1.x - e0.x, y: e1.y - e0.y }),
  }
}

/** Pixel of the basemap image for projected (x, y). Row 0 = top edge = ymax, col 0 = left = xmin. */
export function poleToPixel(
  x: number,
  y: number,
  extent: [number, number, number, number],
  width: number,
  height: number,
): { col: number; row: number } {
  const [xmin, xmax, ymin, ymax] = extent
  return {
    col: ((x - xmin) / (xmax - xmin)) * width,
    row: ((ymax - y) / (ymax - ymin)) * height,
  }
}

/** Rounds a length in metres down to 1, 2 or 5 x 10^n for a scale bar. */
export function niceLength(m: number): number {
  if (!(m > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(m)))
  const f = m / p
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1
  return nice * p
}

/** Matrix (SVG a b c d e f, y flipped to SVG-down) placing a north-up grid image whose centre is at a site. */
export function gridImageMatrix(
  latDeg: number,
  lonDeg: number,
  spacingM: number,
  nx: number,
  ny: number,
): [number, number, number, number, number, number] {
  const { east, north } = poleLocalFrame(latDeg, lonDeg)
  const k = poleScale(latDeg) * spacingM // planar metres per image pixel
  const c = poleForward(latDeg, lonDeg)
  // image x axis = east, image y axis (down) = south; SVG y = -projected y
  const a = east.x * k
  const b = -east.y * k
  const cc = -north.x * k
  const d = north.y * k
  // top-left corner of the image: centre minus half extent along east and plus half along north
  const tlx = c.x - (nx / 2) * east.x * k + (ny / 2) * north.x * k
  const tly = c.y - (nx / 2) * east.y * k + (ny / 2) * north.y * k
  return [a, b, cc, d, tlx, -tly]
}
