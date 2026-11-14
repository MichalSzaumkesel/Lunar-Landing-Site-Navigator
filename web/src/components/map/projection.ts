export const MAP_WIDTH = 720
export const MAP_HEIGHT = 360

export const POLAR_INSET_CX = 640
export const POLAR_INSET_CY = 280
export const POLAR_INSET_RADIUS = 70
export const POLAR_INSET_MIN_LAT = -60

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

export interface Point2D {
  x: number
  y: number
}

export interface Coordinates {
  lat: number
  lon: number
}

/** Equirectangular projection: lat/lon (deg) to SVG pixel (x, y). */
export function equirectangularProject(
  lat: number,
  lon: number,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
): Point2D {
  const x = ((lon + 180) / 360) * width
  const y = ((90 - lat) / 180) * height
  return { x, y }
}

/** Inverse equirectangular projection: SVG pixel (x, y) to lat/lon (deg). */
export function equirectangularUnproject(
  x: number,
  y: number,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
): Coordinates {
  const lon = (x / width) * 360 - 180
  const lat = 90 - (y / height) * 180
  return { lat, lon }
}

/**
 * Azimuthal equidistant projection for the South Pole inset.
 * Projects latitude -90..minLat to a circle of radius R.
 * lon = 0 points up towards -Y.
 */
export function polarInsetProject(
  lat: number,
  lon: number,
  cx = POLAR_INSET_CX,
  cy = POLAR_INSET_CY,
  radius = POLAR_INSET_RADIUS,
  minLat = POLAR_INSET_MIN_LAT,
): Point2D {
  const span = minLat - (-90)
  const colat = Math.max(0, lat - (-90))
  const r = (colat / span) * radius
  const alpha = lon * DEG2RAD

  const x = cx + r * Math.sin(alpha)
  const y = cy - r * Math.cos(alpha)
  return { x, y }
}

/**
 * Inverse azimuthal equidistant projection for the South Pole inset.
 * Converts pixel (x, y) back to lat/lon (deg).
 */
export function polarInsetUnproject(
  x: number,
  y: number,
  cx = POLAR_INSET_CX,
  cy = POLAR_INSET_CY,
  radius = POLAR_INSET_RADIUS,
  minLat = POLAR_INSET_MIN_LAT,
): Coordinates {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  const span = minLat - (-90)

  const colat = (dist / radius) * span
  const lat = -90 + colat

  if (dist === 0) {
    return { lat: -90, lon: 0 }
  }

  const alpha = Math.atan2(dx, -dy)
  let lon = alpha * RAD2DEG
  // Normalize lon to [-180, 180]
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360

  return { lat, lon }
}

/** Checks whether a point (x, y) in SVG coordinates lies within the polar inset circle. */
export function isInPolarInset(
  x: number,
  y: number,
  cx = POLAR_INSET_CX,
  cy = POLAR_INSET_CY,
  radius = POLAR_INSET_RADIUS,
): boolean {
  return Math.hypot(x - cx, y - cy) <= radius
}
