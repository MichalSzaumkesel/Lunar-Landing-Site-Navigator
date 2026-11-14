// Orientation of the Earth as seen from the Moon (data/earth_orientation.json from scope A):
// sub-lunar point and the position angle of Earth's north pole, hourly on the ephemeris grid.

export interface EarthOrientationFile {
  meta?: { synthetic?: boolean; approximate?: boolean }
  start_utc: string
  step_minutes: number
  count: number
  sub_lunar_lat_deg: number[]
  sub_lunar_lon_deg: number[]
  pole_pa_deg: number[]
}

/** Sub-lunar point (the Earth surface point that sees the Moon at its zenith) and pole position angle. */
export interface EarthOrientation {
  subLonDeg: number
  subLatDeg: number
  /** Position angle of Earth's north pole, from lunar north toward east (counter-clockwise on the sky). */
  polePaDeg: number
}

const DEG = Math.PI / 180

export function isValidEarthOrientation(f: unknown): f is EarthOrientationFile {
  if (!f || typeof f !== 'object') return false
  const o = f as EarthOrientationFile
  if (!Number.isInteger(o.count) || o.count < 2 || o.count > 100000) return false
  if (typeof o.step_minutes !== 'number' || !Number.isFinite(o.step_minutes) || o.step_minutes <= 0) return false
  if (typeof o.start_utc !== 'string' || !Number.isFinite(Date.parse(o.start_utc))) return false
  for (const arr of [o.sub_lunar_lat_deg, o.sub_lunar_lon_deg, o.pole_pa_deg]) {
    if (!Array.isArray(arr) || arr.length !== o.count) return false
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'number' || !Number.isFinite(arr[i])) return false
    }
  }
  return true
}

/** Linear interpolation of an angle in degrees along the shortest arc (handles the 0/360 and -180/180 wrap). */
function lerpAngle(a: number, b: number, f: number): number {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  else if (d < -180) d += 360
  return a + d * f
}

/** Orientation at a time; null when the time is outside the file. */
export function earthOrientationAt(file: EarthOrientationFile, timeMs: number): EarthOrientation | null {
  const t0 = Date.parse(file.start_utc)
  const x = (timeMs - t0) / (file.step_minutes * 60_000)
  if (!(x >= 0 && x <= file.count - 1)) return null
  const i = Math.min(Math.floor(x), file.count - 2)
  const f = x - i
  const lon = lerpAngle(file.sub_lunar_lon_deg[i], file.sub_lunar_lon_deg[i + 1], f)
  return {
    subLonDeg: ((((lon + 180) % 360) + 360) % 360) - 180,
    subLatDeg: file.sub_lunar_lat_deg[i] + (file.sub_lunar_lat_deg[i + 1] - file.sub_lunar_lat_deg[i]) * f,
    polePaDeg: (((lerpAngle(file.pole_pa_deg[i], file.pole_pa_deg[i + 1], f)) % 360) + 360) % 360,
  }
}

type V3 = [number, number, number]

const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2])
  return [a[0] / n, a[1] / n, a[2] / n]
}

/**
 * Rotation that orients the Earth sphere (three.js SphereGeometry with an equirectangular map:
 * local +x is lon 0 / lat 0, +y is the north pole, longitude grows east toward -z) so that
 * the sub-lunar point faces the observer and the pole sits at its position angle on the sky.
 *
 * Frame maths, all in the site's ENU (x east, y north, z up):
 *  - E = direction to the Earth. The sub-lunar point's outward normal is -E.
 *  - Reference direction of the position angle: lunar north (the Moon's spin axis), which at a site of
 *    latitude phi is A = (0, cos phi, sin phi). Projected on the sky plane: n = unit(A - (A.E) E).
 *  - Sky east (looking out along E, north up, east to the left): e = n x E.
 *  - Pole direction on the sky: u = cos(pa) n + sin(pa) e. The 3D pole is sin(B) (-E) + cos(B) u, B = sub-lunar latitude.
 * The local orthonormal frame (p, q, p x q) with p = sub-lunar point and q = pole direction made orthogonal to p
 * maps to the world frame (-E, u, -E x u). Returned row-major, already in three.js scene axes
 * (x east, y up, z south), i.e. a point (e, n, u) becomes (e, u, -n).
 * Null when the Earth lies along the axis, where the position angle is undefined.
 */
export function earthRotation(
  siteLatDeg: number,
  earthAzDeg: number,
  earthElDeg: number,
  o: EarthOrientation,
): number[] | null {
  const az = earthAzDeg * DEG
  const el = earthElDeg * DEG
  const E: V3 = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)]
  const A: V3 = [0, Math.cos(siteLatDeg * DEG), Math.sin(siteLatDeg * DEG)]
  const k = dot(A, E)
  const np: V3 = [A[0] - k * E[0], A[1] - k * E[1], A[2] - k * E[2]]
  if (Math.hypot(np[0], np[1], np[2]) < 1e-9) return null
  const n = unit(np)
  const e = cross(n, E)
  const pa = o.polePaDeg * DEG
  const u: V3 = [
    Math.cos(pa) * n[0] + Math.sin(pa) * e[0],
    Math.cos(pa) * n[1] + Math.sin(pa) * e[1],
    Math.cos(pa) * n[2] + Math.sin(pa) * e[2],
  ]
  const g1: V3 = [-E[0], -E[1], -E[2]]
  const g2 = u
  const g3 = cross(g1, g2)

  const L = o.subLonDeg * DEG
  const B = o.subLatDeg * DEG
  const f1: V3 = [Math.cos(B) * Math.cos(L), Math.sin(B), -Math.cos(B) * Math.sin(L)]
  const f2: V3 = [-Math.sin(B) * Math.cos(L), Math.cos(B), Math.sin(B) * Math.sin(L)]
  const f3 = cross(f1, f2)

  // Q = g1 f1^T + g2 f2^T + g3 f3^T, rows reordered ENU -> scene.
  const q = (r: number, c: number) => g1[r] * f1[c] + g2[r] * f2[c] + g3[r] * f3[c]
  const out: number[] = []
  for (const r of [0, 2]) for (let c = 0; c < 3; c++) out.push(q(r, c))
  // Scene row order is (east, up, south); `out` holds east then up, south is minus north.
  for (let c = 0; c < 3; c++) out.push(-q(1, c))
  return out
}

let cached: Promise<EarthOrientationFile | null> | null = null

/** Loads the file once per page; null when it is missing, not JSON or fails validation. */
export function loadEarthOrientation(
  baseUrl: string = import.meta.env?.BASE_URL ?? '/',
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<EarthOrientationFile | null> {
  if (!cached) {
    const url = `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}data/earth_orientation.json`
    cached = (async () => {
      try {
        const res = await fetchImpl(url)
        if (!res.ok) return null
        const data: unknown = JSON.parse(await res.text())
        return isValidEarthOrientation(data) ? data : null
      } catch {
        return null
      }
    })()
  }
  return cached
}
