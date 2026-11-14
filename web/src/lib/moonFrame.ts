import type { SiteBundle } from './types'
import { sampleAt } from './ephem'
import { L_EARTH_KM, L_SUN_KM, R_MOON_KM } from './customSite'

export type Vec3 = [number, number, number]
export type Body = 'sun' | 'earth'

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

/** Position of the body in km from the Moon's centre, from a site's ephemeris at time ms. Null outside the data coverage. */
export function bodyPositionKm(
  bundle: Pick<SiteBundle, 'site' | 'ephem'>,
  body: Body,
  ms: number,
): Vec3 | null {
  const sample = sampleAt(bundle.ephem, ms)
  if (!sample) return null

  const trackPos = body === 'sun' ? sample.sun : sample.earth
  const az = trackPos.az * DEG2RAD
  const el = trackPos.el * DEG2RAD

  const cosEl = Math.cos(el)
  const dEast = Math.sin(az) * cosEl
  const dNorth = Math.cos(az) * cosEl
  const dUp = Math.sin(el)

  const phi = bundle.site.lat_deg * DEG2RAD
  const lam = bundle.site.lon_deg * DEG2RAD
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const cosLam = Math.cos(lam)
  const sinLam = Math.sin(lam)

  const u: Vec3 = [cosPhi * cosLam, cosPhi * sinLam, sinPhi]
  const e: Vec3 = [-sinLam, cosLam, 0]
  const n: Vec3 = [-sinPhi * cosLam, -sinPhi * sinLam, cosPhi]

  const wx = dEast * e[0] + dNorth * n[0] + dUp * u[0]
  const wy = dEast * e[1] + dNorth * n[1] + dUp * u[1]
  const wz = dEast * e[2] + dNorth * n[2] + dUp * u[2]

  const L = body === 'sun' ? L_SUN_KM : L_EARTH_KM
  return [
    R_MOON_KM * u[0] + L * wx,
    R_MOON_KM * u[1] + L * wy,
    R_MOON_KM * u[2] + L * wz,
  ]
}

/** Elevation in degrees of a body at a surface point, from its position in km (no terrain, no refraction). */
export function elevationAt(latDeg: number, lonDeg: number, bodyKm: Vec3): number {
  const phi = latDeg * DEG2RAD
  const lam = lonDeg * DEG2RAD
  const cosPhi = Math.cos(phi)
  const ux = cosPhi * Math.cos(lam)
  const uy = cosPhi * Math.sin(lam)
  const uz = Math.sin(phi)

  const vx = bodyKm[0] - R_MOON_KM * ux
  const vy = bodyKm[1] - R_MOON_KM * uy
  const vz = bodyKm[2] - R_MOON_KM * uz

  const vLen = Math.hypot(vx, vy, vz)
  if (vLen === 0) return 0
  const dot = (vx * ux + vy * uy + vz * uz) / vLen
  return Math.asin(Math.max(-1, Math.min(1, dot))) * RAD2DEG
}

/** Latitude and longitude (degrees, longitude -180..180) of the point directly under the body. */
export function subpoint(bodyKm: Vec3): { lat_deg: number; lon_deg: number } {
  const dist = Math.hypot(bodyKm[0], bodyKm[1], bodyKm[2])
  if (dist === 0) return { lat_deg: 0, lon_deg: 0 }

  const uz = bodyKm[2] / dist
  const lat_deg = Math.asin(Math.max(-1, Math.min(1, uz))) * RAD2DEG
  const lon_deg = Math.atan2(bodyKm[1], bodyKm[0]) * RAD2DEG
  return { lat_deg, lon_deg }
}

/** Elevation grid, row-major from the north row to the south row, columns from lon -180 to +180 (cell centres). */
export function elevationGrid(bodyKm: Vec3, nLat: number, nLon: number): Float32Array {
  const grid = new Float32Array(nLat * nLon)

  const rowCosPhi = new Float64Array(nLat)
  const rowSinPhi = new Float64Array(nLat)
  for (let r = 0; r < nLat; r++) {
    const latDeg = 90 - ((r + 0.5) * 180) / nLat
    const phi = latDeg * DEG2RAD
    rowCosPhi[r] = Math.cos(phi)
    rowSinPhi[r] = Math.sin(phi)
  }

  const colCosLam = new Float64Array(nLon)
  const colSinLam = new Float64Array(nLon)
  for (let c = 0; c < nLon; c++) {
    const lonDeg = -180 + ((c + 0.5) * 360) / nLon
    const lam = lonDeg * DEG2RAD
    colCosLam[c] = Math.cos(lam)
    colSinLam[c] = Math.sin(lam)
  }

  const bx = bodyKm[0]
  const by = bodyKm[1]
  const bz = bodyKm[2]
  let idx = 0

  for (let r = 0; r < nLat; r++) {
    const cosPhi = rowCosPhi[r]
    const sinPhi = rowSinPhi[r]
    const uz = sinPhi
    const vz = bz - R_MOON_KM * uz

    for (let c = 0; c < nLon; c++) {
      const cosLam = colCosLam[c]
      const sinLam = colSinLam[c]

      const ux = cosPhi * cosLam
      const uy = cosPhi * sinLam

      const vx = bx - R_MOON_KM * ux
      const vy = by - R_MOON_KM * uy

      const vLen = Math.hypot(vx, vy, vz)
      const dot = (vx * ux + vy * uy + vz * uz) / vLen
      grid[idx++] = Math.asin(Math.max(-1, Math.min(1, dot))) * RAD2DEG
    }
  }

  return grid
}

/** Points of the line where the body elevation is 0, as a polyline per connected piece (lat/lon degrees). */
export function terminatorLine(
  bodyKm: Vec3,
  n = 181,
): Array<{ lat_deg: number; lon_deg: number }> {
  if (n <= 0) return []

  const dist = Math.hypot(bodyKm[0], bodyKm[1], bodyKm[2])
  if (dist === 0) return []

  const b: Vec3 = [bodyKm[0] / dist, bodyKm[1] / dist, bodyKm[2] / dist]
  const cosRho = Math.min(1, Math.max(-1, R_MOON_KM / dist))
  const rho = Math.acos(cosRho)
  const sinRho = Math.sin(rho)

  let p: Vec3
  if (Math.abs(b[2]) < 0.9) {
    const rawLen = Math.hypot(-b[1], b[0])
    p = [-b[1] / rawLen, b[0] / rawLen, 0]
  } else {
    const rawLen = Math.hypot(-b[2], b[1])
    p = [0, -b[2] / rawLen, b[1] / rawLen]
  }

  const q: Vec3 = [
    b[1] * p[2] - b[2] * p[1],
    b[2] * p[0] - b[0] * p[2],
    b[0] * p[1] - b[1] * p[0],
  ]

  const pts: Array<{ lat_deg: number; lon_deg: number }> = []
  for (let i = 0; i < n; i++) {
    const th = (i / n) * 2 * Math.PI
    const cosTh = Math.cos(th)
    const sinTh = Math.sin(th)

    const ux = cosRho * b[0] + sinRho * (cosTh * p[0] + sinTh * q[0])
    const uy = cosRho * b[1] + sinRho * (cosTh * p[1] + sinTh * q[1])
    const uz = cosRho * b[2] + sinRho * (cosTh * p[2] + sinTh * q[2])

    const lat = Math.asin(Math.max(-1, Math.min(1, uz))) * RAD2DEG
    const lon = Math.atan2(uy, ux) * RAD2DEG
    pts.push({ lat_deg: lat, lon_deg: lon })
  }

  // Split where longitude wraps across +-180
  let splitIdx = -1
  for (let i = 1; i < pts.length; i++) {
    const prevLon = pts[i - 1].lon_deg
    const currLon = pts[i].lon_deg
    if (
      (prevLon > 90 && currLon < -90) ||
      (prevLon < -90 && currLon > 90)
    ) {
      splitIdx = i
      break
    }
  }

  if (splitIdx !== -1) {
    return [...pts.slice(splitIdx), ...pts.slice(0, splitIdx)]
  }

  return pts
}
