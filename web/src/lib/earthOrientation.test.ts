import { describe, expect, it } from 'vitest'
import { earthOrientationAt, earthRotation, isValidEarthOrientation } from './earthOrientation'
import type { EarthOrientationFile } from './earthOrientation'

const file: EarthOrientationFile = {
  start_utc: '2027-01-01T00:00:00Z',
  step_minutes: 60,
  count: 4,
  sub_lunar_lat_deg: [10, 20, 20, 0],
  sub_lunar_lon_deg: [170, -170, -150, -130],
  pole_pa_deg: [350, 10, 20, 30],
}
const T0 = Date.parse(file.start_utc)

function apply(m: number[], v: number[]): number[] {
  return [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2])
}

describe('earthOrientationAt', () => {
  it('interpolates linearly and wraps longitude and position angle', () => {
    const o = earthOrientationAt(file, T0 + 30 * 60_000)!
    expect(Math.abs(o.subLonDeg)).toBeCloseTo(180, 6) // 170 -> -170 goes through 180
    expect(o.subLatDeg).toBeCloseTo(15, 6)
    expect(o.polePaDeg).toBeCloseTo(0, 6) // 350 -> 10 goes through 0
  })
  it('returns the sample values on the grid and null outside', () => {
    expect(earthOrientationAt(file, T0 + 2 * 3_600_000)!.subLonDeg).toBeCloseTo(-150, 9)
    expect(earthOrientationAt(file, T0 + 3 * 3_600_000)!.subLonDeg).toBeCloseTo(-130, 9)
    expect(earthOrientationAt(file, T0 - 1)).toBeNull()
    expect(earthOrientationAt(file, T0 + 3 * 3_600_000 + 1)).toBeNull()
  })
})

describe('isValidEarthOrientation', () => {
  it('accepts a good file and rejects bad ones', () => {
    expect(isValidEarthOrientation(file)).toBe(true)
    expect(isValidEarthOrientation({ ...file, count: 5 })).toBe(false)
    expect(isValidEarthOrientation({ ...file, pole_pa_deg: [1, 2, 3, NaN] })).toBe(false)
    expect(isValidEarthOrientation(null)).toBe(false)
  })
})

describe('earthRotation (hand-made cases, scene axes x east, y up, z south)', () => {
  it('Earth at the zenith of an equatorial site, pole at PA 0: sub-lunar point faces down, north pole points north', () => {
    const m = earthRotation(0, 0, 90, { subLonDeg: 0, subLatDeg: 0, polePaDeg: 0 })!
    const p = apply(m, [1, 0, 0]) // local lon 0 / lat 0
    expect(p[0]).toBeCloseTo(0, 9)
    expect(p[1]).toBeCloseTo(-1, 9) // away from the Earth direction (up) = toward the observer's feet
    expect(p[2]).toBeCloseTo(0, 9)
    const pole = apply(m, [0, 1, 0])
    expect(pole[2]).toBeCloseTo(-1, 9) // north is -z
    expect(pole[0]).toBeCloseTo(0, 9)
  })

  it('position angle 90 deg puts the pole to the east on the sky', () => {
    const m = earthRotation(0, 0, 90, { subLonDeg: 0, subLatDeg: 0, polePaDeg: 90 })!
    const pole = apply(m, [0, 1, 0])
    expect(pole[0]).toBeCloseTo(1, 9)
    expect(pole[2]).toBeCloseTo(0, 9)
  })

  it('longitude grows toward the right of a north-up disc (sky west)', () => {
    const m = earthRotation(0, 0, 90, { subLonDeg: 0, subLatDeg: 0, polePaDeg: 0 })!
    // Local lon +90 is (0, 0, -1). Sky east is the left of a north-up view, so Earth's east limb is on the right: scene -x.
    const limb = apply(m, [0, 0, -1])
    expect(limb[0]).toBeCloseTo(-1, 9)
  })

  it('is a proper rotation and honours latitude and position angle for a generic case', () => {
    const cases = [
      { lat: -85, az: 40, el: 6, o: { subLonDeg: -75, subLatDeg: 20, polePaDeg: 25 } },
      { lat: 20, az: 250, el: 55, o: { subLonDeg: 130, subLatDeg: -15, polePaDeg: 340 } },
    ]
    for (const c of cases) {
      const m = earthRotation(c.lat, c.az, c.el, c.o)!
      const det =
        m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
      expect(det).toBeCloseTo(1, 9)
      // Scene vector of the direction to the Earth.
      const a = (c.az * Math.PI) / 180
      const e = (c.el * Math.PI) / 180
      const E = [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]
      const B = (c.o.subLatDeg * Math.PI) / 180
      const L = (c.o.subLonDeg * Math.PI) / 180
      const p = apply(m, [Math.cos(B) * Math.cos(L), Math.sin(B), -Math.cos(B) * Math.sin(L)])
      for (let i = 0; i < 3; i++) expect(p[i]).toBeCloseTo(-E[i], 9)
      // Pole: its component along the line of sight is sin(B), its sky position angle is the file's.
      const pole = apply(m, [0, 1, 0])
      expect(pole[0] * E[0] + pole[1] * E[1] + pole[2] * E[2]).toBeCloseTo(-Math.sin(B), 9)
      const phi = (c.lat * Math.PI) / 180
      const axis = [0, Math.sin(phi), -Math.cos(phi)] // lunar north in scene axes
      const k = axis[0] * E[0] + axis[1] * E[1] + axis[2] * E[2]
      const n = axis.map((x, i) => x - k * E[i])
      const nl = Math.hypot(n[0], n[1], n[2])
      const nn = n.map((x) => x / nl)
      // Sky east = n x E in ENU; in scene axes (a proper rotation of ENU) the same formula holds.
      const east = [nn[1] * E[2] - nn[2] * E[1], nn[2] * E[0] - nn[0] * E[2], nn[0] * E[1] - nn[1] * E[0]]
      const pn = pole[0] * nn[0] + pole[1] * nn[1] + pole[2] * nn[2]
      const pe = pole[0] * east[0] + pole[1] * east[1] + pole[2] * east[2]
      const pa = ((Math.atan2(pe, pn) * 180) / Math.PI + 360) % 360
      expect(pa).toBeCloseTo(c.o.polePaDeg, 6)
    }
  })

  it('returns null when the Earth lies on the lunar axis', () => {
    expect(earthRotation(90, 0, 90, { subLonDeg: 0, subLatDeg: 0, polePaDeg: 0 })).toBeNull()
  })
})
