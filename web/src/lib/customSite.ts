import type {
  EphemFile,
  HorizonFile,
  Meta,
  MetaInput,
  Site,
  SiteBundle,
} from './types'

export const R_MOON_KM = 1737.4
export const L_SUN_KM = 149597870.7
export const L_EARTH_KM = 384400

export function formatCoord(val: number): string {
  const safe = Object.is(val, -0) ? 0 : val
  return safe.toFixed(3).replace('.', 'p')
}

export function customSiteId(lat: number, lon: number): string {
  return `custom_${formatCoord(lat)}_${formatCoord(lon)}`
}

export function parseCustomSiteId(
  id: string,
): { lat: number; lon: number } | null {
  if (typeof id !== 'string') return null
  const match = /^custom_(-?\d+(?:p\d+)?)_(-?\d+(?:p\d+)?)$/.exec(id)
  if (!match) return null

  const lat = Number(match[1].replace('p', '.'))
  const lon = Number(match[2].replace('p', '.'))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

  return {
    lat: Object.is(lat, -0) ? 0 : round3(lat),
    lon: Object.is(lon, -0) ? 0 : round3(lon),
  }
}

export function round3(val: number): number {
  const rounded = Math.round(val * 1000) / 1000
  return Object.is(rounded, -0) ? 0 : rounded
}

interface Basis3D {
  u: [number, number, number]
  e: [number, number, number]
  n: [number, number, number]
}

function computeBasis(latDeg: number, lonDeg: number): Basis3D {
  const phi = latDeg * (Math.PI / 180)
  const lam = lonDeg * (Math.PI / 180)

  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const cosLam = Math.cos(lam)
  const sinLam = Math.sin(lam)

  // up u = (cos phi cos lam, cos phi sin lam, sin phi)
  const u: [number, number, number] = [cosPhi * cosLam, cosPhi * sinLam, sinPhi]
  // east e = (-sin lam, cos lam, 0)
  const e: [number, number, number] = [-sinLam, cosLam, 0]
  // north n = (-sin phi cos lam, -sin phi sin lam, cos phi)
  const n: [number, number, number] = [-sinPhi * cosLam, -sinPhi * sinLam, cosPhi]

  return { u, e, n }
}

function transformTrack(
  track: { az: number[]; el: number[] },
  L: number,
  refBasis: Basis3D,
  custBasis: Basis3D,
): { az: number[]; el: number[] } {
  const count = track.az.length
  const newAz: number[] = new Array(count)
  const newEl: number[] = new Array(count)

  const { u: uRef, e: eRef, n: nRef } = refBasis
  const { u: uCust, e: eCust, n: nCust } = custBasis

  for (let i = 0; i < count; i++) {
    const az = track.az[i] * (Math.PI / 180)
    const el = track.el[i] * (Math.PI / 180)

    // 1. Local direction at the reference site from az/el (degrees):
    // d = (sin az cos el, cos az cos el, sin el) as (east, north, up) components.
    const cosEl = Math.cos(el)
    const dEast = Math.sin(az) * cosEl
    const dNorth = Math.cos(az) * cosEl
    const dUp = Math.sin(el)

    // 2. World direction w = d.east * e_ref + d.north * n_ref + d.up * u_ref
    const wx = dEast * eRef[0] + dNorth * nRef[0] + dUp * uRef[0]
    const wy = dEast * eRef[1] + dNorth * nRef[1] + dUp * uRef[1]
    const wz = dEast * eRef[2] + dNorth * nRef[2] + dUp * uRef[2]

    // 3. Body position relative to the Moon centre: P = R_MOON_KM * u_ref + L * w
    const Px = R_MOON_KM * uRef[0] + L * wx
    const Py = R_MOON_KM * uRef[1] + L * wy
    const Pz = R_MOON_KM * uRef[2] + L * wz

    // 4. Vector from the custom site: v = P - R_MOON_KM * u_cust; normalise it to v_hat
    const vx = Px - R_MOON_KM * uCust[0]
    const vy = Py - R_MOON_KM * uCust[1]
    const vz = Pz - R_MOON_KM * uCust[2]

    const len = Math.hypot(vx, vy, vz)
    const vHatX = vx / len
    const vHatY = vy / len
    const vHatZ = vz / len

    // 5. Local components at the custom site:
    // east' = v_hat . e_cust, north' = v_hat . n_cust, up' = v_hat . u_cust
    const eastPrime = vHatX * eCust[0] + vHatY * eCust[1] + vHatZ * eCust[2]
    const northPrime = vHatX * nCust[0] + vHatY * nCust[1] + vHatZ * nCust[2]
    const upPrime = vHatX * uCust[0] + vHatY * uCust[1] + vHatZ * uCust[2]

    // el' = asin(clamp(up', -1, 1)) in degrees
    const elDeg = Math.asin(Math.max(-1, Math.min(1, upPrime))) * (180 / Math.PI)
    // az' = atan2(east', north') in degrees normalised to [0, 360)
    let azDeg = Math.atan2(eastPrime, northPrime) * (180 / Math.PI)
    azDeg = ((azDeg % 360) + 360) % 360

    newEl[i] = round3(elDeg)
    let azRounded = round3(azDeg)
    if (azRounded >= 360) {
      azRounded = 0
    }
    newAz[i] = azRounded
  }

  return { az: newAz, el: newEl }
}

function computeDip(h: number): number {
  const dipRad = Math.acos(R_MOON_KM / (R_MOON_KM + h / 1000))
  return dipRad * (180 / Math.PI)
}

export function approximateCustomSite(
  lat: number,
  lon: number,
  reference: SiteBundle,
): SiteBundle {
  const id = customSiteId(lat, lon)
  const latStr = (Object.is(lat, -0) ? 0 : lat).toFixed(3)
  const lonStr = (Object.is(lon, -0) ? 0 : lon).toFixed(3)
  const name = `Custom site (${latStr}, ${lonStr})`

  const refBasis = computeBasis(reference.site.lat_deg, reference.site.lon_deg)
  const custBasis = computeBasis(lat, lon)

  const sunTrack = transformTrack(
    reference.ephem.sun,
    L_SUN_KM,
    refBasis,
    custBasis,
  )
  const earthTrack = transformTrack(
    reference.ephem.earth,
    L_EARTH_KM,
    refBasis,
    custBasis,
  )

  const mask2Val = round3(-computeDip(2))
  const mask10Val = round3(-computeDip(10))

  const mask2 = new Array(720).fill(mask2Val)
  const mask10 = new Array(720).fill(mask10Val)

  const generatedUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const inputs: MetaInput[] = [
    {
      name: 'Smooth-sphere horizon',
      url: '',
      notes: 'No terrain; curvature dip only',
    },
    {
      name: `Ephemeris rotated from ${reference.site.id}`,
      url: '',
      notes:
        'Sun and Earth positions re-projected from the reference site; distances approximated by constants',
    },
    ...(reference.ephem.meta?.inputs ?? []),
  ]

  const synthetic = Boolean(
    reference.synthetic ?? reference.ephem.meta?.synthetic,
  )

  const meta: Meta = {
    contract_version:
      reference.ephem.meta?.contract_version ??
      reference.horizon.meta?.contract_version ??
      '1.1.1',
    generated_utc: generatedUtc,
    generator: 'web/src/lib/customSite.ts',
    synthetic,
    approximate: true,
    inputs,
  }

  const site: Site = {
    id,
    name,
    category: 'custom',
    mission: null,
    agency: null,
    country: null,
    elevation_m: null,
    landing_date_utc: null,
    region_radius_km: null,
    lat_deg: lat,
    lon_deg: lon,
    status: 'planned',
    source: {
      title: 'User-entered coordinates',
      url: '',
    },
    notes: `Horizon is a smooth sphere; ephemeris is derived from reference site ${reference.site.id}.`,
  }

  const horizon: HorizonFile = {
    meta,
    site_id: id,
    az_step_deg: 0.5,
    n: 720,
    observer_heights_m: [2, 10],
    masks: {
      '2': mask2,
      '10': mask10,
    },
  }

  const ephem: EphemFile = {
    meta,
    site_id: id,
    start_utc: reference.ephem.start_utc,
    step_minutes: reference.ephem.step_minutes,
    count: reference.ephem.count,
    sun: sunTrack,
    earth: earthTrack,
    sun_ang_radius_deg: reference.ephem.sun_ang_radius_deg,
    earth_ang_radius_deg: reference.ephem.earth_ang_radius_deg,
  }

  return {
    site,
    horizon,
    ephem,
    terrain: null,
    provenance: 'custom_approx',
    synthetic,
    approximate: true,
  }
}
