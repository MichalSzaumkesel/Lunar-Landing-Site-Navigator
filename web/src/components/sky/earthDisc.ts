// Earth phase for drawing: lit fraction, name and the screen direction of the lit limb.
import { brightLimbDirection, earthIlluminatedFraction, earthPhaseName } from '../../lib/earthPhase'
import type { EarthPhaseName } from '../../lib/earthPhase'
import type { SkySample } from '../../lib/ephem'

const RAD = Math.PI / 180

export interface EarthPhaseView {
  /** Lit fraction of the disc, 0..1. */
  fraction: number
  name: EarthPhaseName
  /** Lit-limb direction in the local tangent plane: east-ish (azimuth increasing) and up (elevation increasing). */
  dAz: number
  dEl: number
}

/** Phase of the Earth disc as seen from the site, derived from the Sun-Earth angle. */
export function earthPhaseView(sample: SkySample): EarthPhaseView {
  const fraction = earthIlluminatedFraction(sample.sun, sample.earth)
  const [e, n, u] = brightLimbDirection(sample.earth, sample.sun)
  const az = sample.earth.az * RAD
  const el = sample.earth.el * RAD
  // Unit vectors of increasing azimuth and increasing elevation at the Earth position (east, north, up).
  const dAz = e * Math.cos(az) - n * Math.sin(az)
  const dEl = -e * Math.sin(el) * Math.sin(az) - n * Math.sin(el) * Math.cos(az) + u * Math.cos(el)
  return { fraction, name: earthPhaseName(fraction), dAz, dEl }
}

/** Screen rotation (degrees, SVG sense) of the lit limb in a strip view: x is azimuth, y is up. */
export function stripRotationDeg(v: Pick<EarthPhaseView, 'dAz' | 'dEl'>): number {
  return Math.atan2(-v.dEl, v.dAz) / RAD
}

/** Screen rotation of the lit limb in the polar plot, where the body sits at azimuth `azDeg`. */
export function polarRotationDeg(v: Pick<EarthPhaseView, 'dAz' | 'dEl'>, azDeg: number): number {
  const a = azDeg * RAD
  // Increasing azimuth is (cos a, sin a) on screen, increasing elevation points to the centre.
  const x = v.dAz * Math.cos(a) - v.dEl * Math.sin(a)
  const y = v.dAz * Math.sin(a) + v.dEl * Math.cos(a)
  return Math.atan2(y, x) / RAD
}

/**
 * Lit part of a unit disc whose lit limb points to +x: the lit half circle closed by the terminator
 * ellipse. Rotate by the limb direction and scale to the disc radius when drawing.
 */
export function litPartPath(fraction: number): string {
  const k = Math.max(0, Math.min(1, fraction))
  if (k <= 0.001) return ''
  if (k >= 0.999) return 'M0,-1A1,1 0 1 1 0,1A1,1 0 1 1 0,-1Z'
  const rx = Math.abs(1 - 2 * k).toFixed(3)
  // Crescent: the terminator bulges towards the lit side. Gibbous: towards the dark side.
  const sweep = k < 0.5 ? 0 : 1
  return `M0,-1A1,1 0 0 1 0,1A${rx},1 0 0 ${sweep} 0,-1Z`
}

const PHASE_TEXT: Record<EarthPhaseName, string> = {
  new: 'new',
  crescent: 'crescent',
  half: 'half',
  gibbous: 'gibbous',
  full: 'full',
}

export function earthPhaseText(v: Pick<EarthPhaseView, 'fraction' | 'name'>): string {
  return `Earth lit ${Math.round(v.fraction * 100)} %, ${PHASE_TEXT[v.name]}`
}
