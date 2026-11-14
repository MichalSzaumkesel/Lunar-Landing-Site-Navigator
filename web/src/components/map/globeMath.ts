/**
 * Globe frame shared by GlobeView and its tests.
 *
 * three.js SphereGeometry puts texture u = 0 at -X and u = 0.5 at +X, with u growing toward -Z, and v = 1 (image top)
 * at +Y. With an equirectangular image (left edge lon -180, top lat +90) this gives:
 *   lon 0 -> +X, lon 90E -> -Z, lon 90W -> +Z, north pole -> +Y.
 * Moon-fixed frame of lib/moonFrame (x: lon 0, y: lon 90E, z: north) maps to three as (x, z, -y).
 */

export type V3 = [number, number, number]

const D2R = Math.PI / 180
const R2D = 180 / Math.PI

/** Unit vector in globe (three.js) coordinates for a planetocentric lat/lon in degrees (lon east-positive). */
export function latLonToGlobe(latDeg: number, lonDeg: number): V3 {
  const p = latDeg * D2R
  const l = lonDeg * D2R
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)]
}

/** Inverse of latLonToGlobe for any non-zero vector. Longitude in -180..180. */
export function globeToLatLon(v: V3): { lat: number; lon: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1
  const lat = Math.asin(Math.max(-1, Math.min(1, v[1] / r))) * R2D
  const lon = Math.atan2(-v[2], v[0]) * R2D
  return { lat, lon: lon === -180 ? 180 : lon }
}

/** Moon-fixed (lib/moonFrame) vector to globe coordinates. */
export function moonFixedToGlobe(v: V3): V3 {
  return [v[0], v[2], -v[1]]
}

/** Texture u (0..1, left = lon -180) and v (0..1, top = lat +90) for a lat/lon: the equirectangular image pixel. */
export function latLonToImageUV(latDeg: number, lonDeg: number): { u: number; v: number } {
  return { u: (lonDeg + 180) / 360, v: (90 - latDeg) / 180 }
}

/**
 * Camera position looking at a lat/lon from distance d. Near the poles the view is tilted by a small margin so
 * OrbitControls (which keeps +Y up) never sits exactly on its singular axis.
 */
export function cameraPositionFor(latDeg: number, lonDeg: number, d: number, poleMarginDeg = 2): V3 {
  const lat = Math.max(-90 + poleMarginDeg, Math.min(90 - poleMarginDeg, latDeg))
  const v = latLonToGlobe(lat, lonDeg)
  return [v[0] * d, v[1] * d, v[2] * d]
}

/** Spherical interpolation between two directions (unit vectors), t in 0..1. Falls back to lerp when nearly equal. */
export function slerpDir(a: V3, b: V3, t: number): V3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const om = Math.acos(dot)
  if (om < 1e-4) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  if (Math.PI - om < 1e-3) {
    // opposite directions: go through a perpendicular so the path is defined
    const mid: V3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    return t < 0.5 ? slerpDir(a, mid, t * 2) : slerpDir(mid, b, (t - 0.5) * 2)
  }
  const s = Math.sin(om)
  const ka = Math.sin((1 - t) * om) / s
  const kb = Math.sin(t * om) / s
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]
}

/** Smoothstep ease for camera moves. */
export const ease = (t: number): number => t * t * (3 - 2 * t)
