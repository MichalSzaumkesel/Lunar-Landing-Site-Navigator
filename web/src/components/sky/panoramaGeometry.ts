// Pure helpers for the 360 degree panorama strip and the loupe.
import type { EphemFile, SiteBundle } from '../../lib/types'
import { horizonAt } from '../../lib/horizon'
import {
  RIM_MARKER_BELOW_DEG,
  TRACK_BREAK_AZ_JUMP_DEG,
  TRACK_BREAK_BELOW_DEG,
  chooseSkyZoom,
  pickMask,
  ringStepDeg,
  windowSampleRange,
} from './geometry'
import type { ZoomEl } from './geometry'

/** Panorama strip in viewBox units: x is azimuth 0..360, y is elevation 0..zoomEl (up). */
export const PANO_W = 720
export const PANO_H = 180
export const PANO_PAD_LEFT = 40
export const PANO_PAD_TOP = 10
export const PANO_PAD_BOTTOM = 34
export const PANO_VIEW_W = PANO_PAD_LEFT + PANO_W + 16
export const PANO_VIEW_H = PANO_PAD_TOP + PANO_H + PANO_PAD_BOTTOM
export const PANO_MIN_DISC_R = 4

export function azToX(azDeg: number): number {
  return (azDeg / 360) * PANO_W
}

export function elToY(elDeg: number, zoomEl: number): number {
  return PANO_H * (1 - elDeg / zoomEl)
}

export interface PanoTick {
  el: number
  y: number
}

export interface PanoramaModel {
  zoomEl: ZoomEl
  mask: readonly number[]
  azStepDeg: number
  ticks: PanoTick[]
  /** Terrain silhouette: filled between the horizon curve and the bottom edge. */
  terrainPath: string
  horizonPath: string
  sunTrackPath: string
  earthTrackPath: string
  /** Strip pixels per degree, horizontal and vertical. */
  xPerDeg: number
  yPerDeg: number
}

const f1 = (v: number) => v.toFixed(1)

/** Polylines of one body over samples [k0, k1). A line breaks below the horizon and at the 360 to 0 wrap. */
export function stripSegments(
  az: ArrayLike<number>,
  el: ArrayLike<number>,
  k0: number,
  k1: number,
  zoomEl: number,
): string {
  let d = ''
  let open = false
  let prevAz = 0
  for (let k = k0; k < k1; k++) {
    if (!(el[k] >= -TRACK_BREAK_BELOW_DEG)) {
      open = false
      continue
    }
    if (open && Math.abs(az[k] - prevAz) > TRACK_BREAK_AZ_JUMP_DEG) open = false
    d += `${open ? 'L' : 'M'}${f1(azToX(az[k]))},${f1(elToY(Math.max(el[k], 0), zoomEl))}`
    open = true
    prevAz = az[k]
  }
  return d
}

/** Everything that does not depend on the cursor. Memoise on bundle, observer height and window. */
export function buildPanoramaModel(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: number,
  startMs: number,
  endMs: number,
): PanoramaModel {
  const { ephem, horizon } = bundle
  const mask = pickMask(bundle, observerHeightM)
  const azStepDeg = horizon.az_step_deg
  const zoomEl = chooseSkyZoom(bundle, observerHeightM, startMs, endMs)
  const { k0, k1 } = windowSampleRange(ephem, startMs, endMs)

  const ticks: PanoTick[] = []
  const step = ringStepDeg(zoomEl)
  for (let el = step; el < zoomEl; el += step) ticks.push({ el, y: elToY(el, zoomEl) })

  let horizonPath = ''
  if (mask.length > 0) {
    mask.forEach((el, i) => {
      horizonPath += `${i === 0 ? 'M' : 'L'}${f1(azToX(i * azStepDeg))},${f1(elToY(Math.max(el, 0), zoomEl))}`
    })
    horizonPath += `L${f1(PANO_W)},${f1(elToY(Math.max(mask[0], 0), zoomEl))}`
  }
  const terrainPath = horizonPath ? `${horizonPath}L${PANO_W},${PANO_H}L0,${PANO_H}Z` : ''

  const track = (b: EphemFile['sun']) => stripSegments(b.az, b.el, k0, k1, zoomEl)
  return {
    zoomEl,
    mask,
    azStepDeg,
    ticks,
    terrainPath,
    horizonPath,
    sunTrackPath: track(ephem.sun),
    earthTrackPath: track(ephem.earth),
    xPerDeg: PANO_W / 360,
    yPerDeg: PANO_H / zoomEl,
  }
}

/** True when the body is drawn as a marker at the bottom edge instead of a disc. */
export function isBelowStrip(elDeg: number): boolean {
  return elDeg < -RIM_MARKER_BELOW_DEG
}

/** Loupe window around a body, in degrees. */
export const LOUPE_HALF_AZ_DEG = 3
export const LOUPE_EL_MIN_DEG = -1
export const LOUPE_EL_MAX_DEG = 5
export const LOUPE_SIZE = 240
const LOUPE_SPAN_DEG = 2 * LOUPE_HALF_AZ_DEG
export const LOUPE_PX_PER_DEG = LOUPE_SIZE / LOUPE_SPAN_DEG

export interface LoupePoint {
  x: number
  y: number
}

/** Loupe x for an azimuth difference from the window centre. */
export function loupeX(azOffsetDeg: number): number {
  return (azOffsetDeg + LOUPE_HALF_AZ_DEG) * LOUPE_PX_PER_DEG
}

export function loupeY(elDeg: number): number {
  return (LOUPE_EL_MAX_DEG - elDeg) * LOUPE_PX_PER_DEG
}

/** True when a body centre lies inside the magnified window. */
export function inLoupeWindow(azOffsetDeg: number, elDeg: number): boolean {
  return (
    Math.abs(azOffsetDeg) <= LOUPE_HALF_AZ_DEG && elDeg >= LOUPE_EL_MIN_DEG && elDeg <= LOUPE_EL_MAX_DEG
  )
}

/** Terrain silhouette in the loupe, centred on `centerAz`: filled below the interpolated horizon. */
export function loupeTerrainPath(mask: readonly number[], azStepDeg: number, centerAz: number): { fill: string; edge: string } {
  if (mask.length === 0 || azStepDeg <= 0) return { fill: '', edge: '' }
  const n = Math.max(2, Math.round(LOUPE_SPAN_DEG / azStepDeg) + 1)
  let edge = ''
  for (let i = 0; i < n; i++) {
    const off = -LOUPE_HALF_AZ_DEG + (i * LOUPE_SPAN_DEG) / (n - 1)
    const el = horizonAt(mask, azStepDeg, centerAz + off)
    edge += `${i === 0 ? 'M' : 'L'}${f1(loupeX(off))},${f1(loupeY(el))}`
  }
  return { edge, fill: `${edge}L${LOUPE_SIZE},${LOUPE_SIZE}L0,${LOUPE_SIZE}Z` }
}
