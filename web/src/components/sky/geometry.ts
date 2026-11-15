// Pure helpers for the polar sky plot: scale choice, polar mapping, tracks, terrain paths.
import { curveLinearClosed, lineRadial } from 'd3'
import { ephemCoverage } from '../../lib/ephem'
import type { SkySample } from '../../lib/ephem'
import { horizonAt } from '../../lib/horizon'
import { bodyFraction } from '../../lib/metrics'
import type { EphemFile, SiteBundle } from '../../lib/types'

export const VIEW_SIZE = 600
export const CENTER = VIEW_SIZE / 2
export const RIM_R = 250

/** Elevation at the plot centre. The smallest level that fits the data is chosen. */
export const ZOOM_LEVELS = [5, 10, 20, 45, 90] as const
export type ZoomEl = (typeof ZOOM_LEVELS)[number]
export const ZOOM_MARGIN = 1.15

/** Ring spacing per zoom level, in degrees of elevation. */
const RING_STEP: Record<ZoomEl, number> = { 5: 1, 10: 2, 20: 5, 45: 15, 90: 30 }

export const MIN_DISC_R = 4
export const RIM_MARKER_BELOW_DEG = 1
export const TRACK_BREAK_BELOW_DEG = 2
export const TRACK_BREAK_AZ_JUMP_DEG = 180

const RAD = Math.PI / 180

export interface SkyPoint {
  az: number
  el: number
}

export function chooseZoomEl(maxNeededDeg: number): ZoomEl {
  const need = maxNeededDeg * ZOOM_MARGIN
  for (const z of ZOOM_LEVELS) {
    if (z >= need) return z
  }
  return 90
}

/** Radius for an elevation: 0 deg is the rim, `zoomEl` is the centre. Below 0 it lies outside the rim. */
export function elevationToRadius(elDeg: number, zoomEl: number, rimR = RIM_R): number {
  return Math.max(0, rimR * (1 - elDeg / zoomEl))
}

/** Azimuth 0 at the top, clockwise: north up, east right. */
export function polarToXY(
  azDeg: number,
  elDeg: number,
  zoomEl: number,
  rimR = RIM_R,
  cx = CENTER,
  cy = CENTER,
): { x: number; y: number } {
  const r = elevationToRadius(elDeg, zoomEl, rimR)
  const a = azDeg * RAD
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
}

export function degToPx(deg: number, zoomEl: number, rimR = RIM_R): number {
  return (deg * rimR) / zoomEl
}

export interface DiscSize {
  /** True angular size in plot units. */
  trueR: number
  /** Radius actually filled (at least `minR`). */
  drawR: number
  /** True when the minimum applies and a thin ring at true size should be drawn on top. */
  needsRing: boolean
}

export function discSize(angRadiusDeg: number, zoomEl: number, minR = MIN_DISC_R): DiscSize {
  const trueR = degToPx(angRadiusDeg, zoomEl)
  return { trueR, drawR: Math.max(trueR, minR), needsRing: trueR < minR }
}

/** Signed shortest azimuth difference b - a, in (-180, 180]. */
export function azDiff(a: number, b: number): number {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  else if (d <= -180) d += 360
  return d
}

/** Indices [k0, k1) of ephemeris samples with startMs <= t <= endMs, limited to the coverage. */
export function windowSampleRange(
  e: Pick<EphemFile, 'start_utc' | 'step_minutes' | 'count'>,
  startMs: number,
  endMs: number,
): { k0: number; k1: number } {
  const { startMs: covStart } = ephemCoverage(e)
  const stepMs = e.step_minutes * 60_000
  if (e.count <= 0 || stepMs <= 0 || endMs < startMs) return { k0: 0, k1: 0 }
  const k0 = Math.max(0, Math.ceil((startMs - covStart) / stepMs))
  const k1 = Math.min(e.count, Math.floor((endMs - covStart) / stepMs) + 1)
  return k1 > k0 ? { k0, k1 } : { k0: 0, k1: 0 }
}

/**
 * Splits samples [k0, k1) into polylines. A line breaks at samples more than `belowDeg` under the
 * horizon and where the azimuth jumps by more than `maxAzJumpDeg`. The azimuth step is the shortest
 * angular difference, so the ordinary 359 to 1 wrap is not a break (the plot is polar).
 */
export function trackSegments(
  az: ArrayLike<number>,
  el: ArrayLike<number>,
  k0: number,
  k1: number,
  belowDeg = TRACK_BREAK_BELOW_DEG,
  maxAzJumpDeg = TRACK_BREAK_AZ_JUMP_DEG,
): SkyPoint[][] {
  const segments: SkyPoint[][] = []
  let current: SkyPoint[] = []
  const flush = () => {
    if (current.length > 1) segments.push(current)
    current = []
  }
  for (let k = k0; k < k1; k++) {
    if (!(el[k] >= -belowDeg)) {
      flush()
      continue
    }
    const prev = current[current.length - 1]
    if (prev && Math.abs(azDiff(prev.az, az[k])) > maxAzJumpDeg) flush()
    current.push({ az: az[k], el: el[k] })
  }
  flush()
  return segments
}

/** Largest horizon value of a mask, in degrees. */
export function maxOf(values: readonly number[]): number {
  let m = -Infinity
  for (const v of values) if (v > m) m = v
  return m
}

/** Largest Sun and Earth elevation over samples [k0, k1). */
export function maxBodyElevation(e: EphemFile, k0: number, k1: number): number {
  let m = -Infinity
  for (let k = k0; k < k1; k++) {
    if (e.sun.el[k] > m) m = e.sun.el[k]
    if (e.earth.el[k] > m) m = e.earth.el[k]
  }
  return m
}

export function pickMask(bundle: Pick<SiteBundle, 'horizon'>, observerHeightM: number): readonly number[] {
  const { masks } = bundle.horizon
  return masks[String(observerHeightM)] ?? masks['2'] ?? Object.values(masks)[0] ?? []
}

/** Ring spacing of a zoom level, in degrees of elevation. */
export function ringStepDeg(zoomEl: ZoomEl): number {
  return RING_STEP[zoomEl]
}

/** Scale label of the polar plot: what elevation the centre stands for at this zoom. */
export function skyZoomLabel(zoomEl: number): string {
  return zoomEl >= 90
    ? 'Full sky: centre = 90° elevation (straight up)'
    : `Zoom: centre = ${zoomEl}° elevation`
}

/** Plain-language description of the plot centre, for legends and the tutorial. */
export function skyCentreText(zoomEl: number): string {
  return zoomEl >= 90 ? 'straight up' : `${zoomEl}° above the horizon (the plot is zoomed in)`
}

/** Zoom shared by the polar plot and the panorama: the smallest level that fits horizon and bodies. */
export function chooseSkyZoom(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: number,
  startMs: number,
  endMs: number,
): ZoomEl {
  const mask = pickMask(bundle, observerHeightM)
  const { k0, k1 } = windowSampleRange(bundle.ephem, startMs, endMs)
  const maxHorizon = mask.length ? maxOf(mask) : 0
  const maxBodies = k1 > k0 ? maxBodyElevation(bundle.ephem, k0, k1) : 0
  return chooseZoomEl(Math.max(maxHorizon, maxBodies, 0))
}

/** The uncertainty band is drawn only when it is at least this wide on screen (viewBox units). */
export const MIN_BAND_PX = 2

/** Positive `uncertainty_deg` of a horizon file, else null. */
function bandDeg(horizon: { uncertainty_deg?: number }): number | null {
  const u = horizon.uncertainty_deg
  return typeof u === 'number' && Number.isFinite(u) && u > 0 ? u : null
}

export interface SkyRing {
  el: number
  r: number
}

export interface SkyModel {
  zoomEl: ZoomEl
  mask: readonly number[]
  azStepDeg: number
  rings: SkyRing[]
  /** Spokes every 30 deg, as one path relative to the plot centre. */
  spokesPath: string
  /** Rim circle plus horizon polygon (fill with evenodd), relative to the plot centre. */
  terrainPath: string
  /** The horizon curve only, relative to the plot centre. */
  horizonPath: string
  /** Band of +-uncertainty_deg around the horizon (fill with evenodd); '' when absent or too thin to see. */
  bandPath: string
  sunTrackPath: string
  earthTrackPath: string
}

function radialPath(points: readonly SkyPoint[], zoomEl: number, closed: boolean, clampToRim: boolean): string {
  const gen = lineRadial<SkyPoint>()
    .angle((p) => p.az * RAD)
    .radius((p) => elevationToRadius(clampToRim ? Math.max(0, p.el) : p.el, zoomEl))
    .digits(1)
  if (closed) gen.curve(curveLinearClosed)
  return gen(points as SkyPoint[]) ?? ''
}

function circlePath(r: number): string {
  return `M${r},0A${r},${r} 0 1 0 ${-r},0A${r},${r} 0 1 0 ${r},0Z`
}

/**
 * Everything that does not depend on the time cursor. Memoise on bundle, observer height and window.
 */
export function buildSkyModel(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: number,
  startMs: number,
  endMs: number,
): SkyModel {
  const { ephem, horizon } = bundle
  const mask = pickMask(bundle, observerHeightM)
  const azStepDeg = horizon.az_step_deg
  const { k0, k1 } = windowSampleRange(ephem, startMs, endMs)

  const zoomEl = chooseSkyZoom(bundle, observerHeightM, startMs, endMs)

  const rings: SkyRing[] = []
  const step = RING_STEP[zoomEl]
  for (let el = step; el < zoomEl; el += step) rings.push({ el, r: elevationToRadius(el, zoomEl) })

  let spokesPath = ''
  for (let az = 0; az < 360; az += 30) {
    const { x, y } = polarToXY(az, 0, zoomEl, RIM_R, 0, 0)
    spokesPath += `M0,0L${x.toFixed(1)},${y.toFixed(1)}`
  }

  const horizonPoints: SkyPoint[] = mask.map((el, i) => ({ az: i * azStepDeg, el }))
  const horizonPath = radialPath(horizonPoints, zoomEl, true, true)
  const terrainPath = circlePath(RIM_R) + horizonPath

  const u = bandDeg(horizon)
  const bandPath =
    u !== null && mask.length > 0 && degToPx(2 * u, zoomEl) >= MIN_BAND_PX
      ? radialPath(horizonPoints.map((p) => ({ az: p.az, el: p.el + u })), zoomEl, true, true) +
        radialPath(horizonPoints.map((p) => ({ az: p.az, el: p.el - u })), zoomEl, true, true)
      : ''

  const trackPath = (body: EphemFile['sun']) =>
    trackSegments(body.az, body.el, k0, k1)
      .map((seg) => radialPath(seg, zoomEl, false, false))
      .join('')

  return {
    zoomEl,
    mask,
    azStepDeg,
    rings,
    spokesPath,
    terrainPath,
    horizonPath,
    bandPath,
    sunTrackPath: trackPath(ephem.sun),
    earthTrackPath: trackPath(ephem.earth),
  }
}

export interface BodyReadout {
  az: number
  el: number
  horizonEl: number
  clearance: number
  /** Visible share of the disc, 0..1 (contract section 3). */
  fraction: number
  /** Centre above the terrain horizon, i.e. fraction >= 0.5. */
  visible: boolean
}

export function describeBody(
  pos: SkyPoint,
  mask: readonly number[],
  azStepDeg: number,
  angRadiusDeg: number,
): BodyReadout {
  const horizonEl = horizonAt(mask, azStepDeg, pos.az)
  const clearance = pos.el - horizonEl
  const fraction = bodyFraction(clearance, angRadiusDeg)
  return { az: pos.az, el: pos.el, horizonEl, clearance, fraction, visible: fraction >= 0.5 }
}

export interface SkyReadout {
  sun: BodyReadout
  earth: BodyReadout
}

export function describeSky(
  sample: SkySample,
  model: Pick<SkyModel, 'mask' | 'azStepDeg'>,
  ephem: Pick<EphemFile, 'sun_ang_radius_deg' | 'earth_ang_radius_deg'>,
): SkyReadout {
  return {
    sun: describeBody(sample.sun, model.mask, model.azStepDeg, ephem.sun_ang_radius_deg),
    earth: describeBody(sample.earth, model.mask, model.azStepDeg, ephem.earth_ang_radius_deg),
  }
}

export function sunStateText(visible: boolean): string {
  return visible ? 'Sun visible' : 'Sun below horizon'
}

export function earthStateText(visible: boolean): string {
  return visible ? 'Earth in view' : 'Earth below horizon'
}

const MINUS = '−'

/** Fixed digits with a typographic minus. */
export function fmtNum(v: number, digits: number, signed = false): string {
  const s = Math.abs(v).toFixed(digits)
  const zero = Number(s) === 0
  if (v < 0 && !zero) return MINUS + s
  return signed && !zero ? '+' + s : s
}

/** Hours with one decimal and a unit, the single format for durations in hours ("374.0 h"). */
export function fmtHours(v: number): string {
  return `${fmtNum(Object.is(v, -0) ? 0 : v, 1)} h`
}

export function fmtUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}
