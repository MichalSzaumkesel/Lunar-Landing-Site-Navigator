// Pure helpers behind the 3D view controls. Directions are ENU unit vectors or (azimuth, elevation) in degrees.

/** The surface camera has a 60 degree vertical field, so a third from the top is 10 degrees above the centre. */
export const FACE_PITCH_OFFSET_DEG = 10
export const MIN_FACE_ELEVATION_DEG = 4

export const SIZE_MIN = 1
export const SIZE_MAX = 20
export const SIZE_STEP = 0.5

export interface FaceTarget {
  azimuthDeg: number
  pitchDeg: number
  /** True when the body is under the local horizon at its azimuth. */
  belowHorizon: boolean
  /** Degrees under the horizon (0 when above). */
  belowDeg: number
}

/**
 * Where to point the camera to show a body: its azimuth, and a pitch that puts it about a third from
 * the top of the view without ever looking under the horizon line.
 * `horizonEl` is the local horizon elevation at that azimuth (terrain mask), 0 for a flat horizon.
 */
export function faceTarget(azDeg: number, elDeg: number, horizonEl = 0): FaceTarget {
  const clearance = elDeg - horizonEl
  return {
    azimuthDeg: ((azDeg % 360) + 360) % 360,
    pitchDeg: Math.max(0, Math.max(elDeg, MIN_FACE_ELEVATION_DEG) - FACE_PITCH_OFFSET_DEG),
    belowHorizon: clearance < 0,
    belowDeg: Math.max(0, -clearance),
  }
}

/** Orbit target for the overview camera: look towards the body azimuth, a little lower than before. */
export const OVERVIEW_FACE_MAX_EL_DEG = 25
export const OVERVIEW_FACE_MIN_EL_DEG = 10
export const OVERVIEW_FACE_MS = 600

export function overviewFaceTarget(azDeg: number, currentElDeg: number): { azimuthDeg: number; elevationDeg: number } {
  return {
    azimuthDeg: ((azDeg % 360) + 360) % 360,
    elevationDeg: Math.max(OVERVIEW_FACE_MIN_EL_DEG, Math.min(OVERVIEW_FACE_MAX_EL_DEG, currentElDeg)),
  }
}

export function belowHorizonText(body: 'Sun' | 'Earth', belowDeg: number): string {
  const digits = belowDeg < 0.1 ? 2 : 1
  return `${body} is ${belowDeg.toFixed(digits)} deg below the horizon`
}

export function clampSize(x: number): number {
  return Math.max(SIZE_MIN, Math.min(SIZE_MAX, x))
}

/** Readout of the Sun and Earth size slider. */
export function sizeLabel(scale: number): string {
  return scale <= SIZE_MIN ? 'True size' : `${scale}x`
}

export function sizeValueText(scale: number): string {
  return scale <= SIZE_MIN ? 'True size' : `${scale} times true size`
}

/** Rendered angular radius of a body for the slider value (1 is the true angular size). */
export function bodyAngularRadiusDeg(trueRadiusDeg: number, scale: number): number {
  return trueRadiusDeg * clampSize(scale)
}

type Vec3 = readonly [number, number, number]

/**
 * Lit share of the Earth disc seen from the Moon, from the directions of the Sun and Earth in the
 * same frame. The observer looks along -earthDir, so the lit share is (1 + sun . toObserver) / 2.
 * Equals (1 - cos e) / 2 for the Sun-Earth separation e, the "Earth lit" readout formula.
 */
export function earthLitFraction(sunDir: Vec3, earthDir: Vec3): number {
  const dot = sunDir[0] * earthDir[0] + sunDir[1] * earthDir[1] + sunDir[2] * earthDir[2]
  return Math.max(0, Math.min(1, (1 - dot) / 2))
}

const GLOW_FADE_DEG = 12

/**
 * Strength 0..1 of the soft glow drawn on the horizon for a body that is hidden behind it.
 * `clearanceDeg` is body elevation minus horizon elevation at its azimuth; zero while any of the
 * disc is still above the horizon.
 */
export function horizonGlowStrength(clearanceDeg: number, angRadiusDeg: number): number {
  const depth = -clearanceDeg - angRadiusDeg
  if (depth < 0 || depth >= GLOW_FADE_DEG) return 0
  const t = 1 - depth / GLOW_FADE_DEG
  return t * t
}

/**
 * Camera angles (azimuth clockwise from north, elevation) that look from the camera to a point.
 * `dx` is east and `dz` is south (scene axes), `dy` is up, all in metres.
 */
export function lookAnglesTo(dx: number, dz: number, dy: number): { azimuthDeg: number; elevationDeg: number } {
  return {
    azimuthDeg: (((Math.atan2(dx, -dz) * 180) / Math.PI) % 360 + 360) % 360,
    elevationDeg: (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI,
  }
}

/** Overlay wording in Simple: the same fixed phrases as the cards. */
export function simpleSunText(visible: boolean): string {
  if (visible) return 'Sun visible'
  return 'Sun below horizon'
}
