import { describe, expect, it } from 'vitest'
import { describeBody } from '../components/sky/geometry'
import { horizonAt } from '../lib/horizon'
import {
  bodyClearsHorizon,
  SKIRT_BOTTOM_EL_DEG,
  skirtElevationAt,
  skirtPositions,
  skirtProfile,
} from './skirt'

// Hand-made mask: 4 samples at 90 degree steps, north 1 deg, east 3 deg, south 0 deg, west 5 deg.
const MASK4 = [1, 3, 0, 5]
const STEP4 = 90

// 720-ray mask: a 6 degree ridge around azimuth 33 and 0.5 degrees elsewhere.
const MASK720 = Array.from({ length: 720 }, (_, i) => {
  const az = i * 0.5
  const d = Math.min(Math.abs(az - 33), 360 - Math.abs(az - 33))
  return 0.5 + 5.5 * Math.max(0, 1 - d / 20)
})

describe('skirtElevationAt', () => {
  it('returns the mask value at a sample', () => {
    expect(skirtElevationAt(MASK4, STEP4, 0)).toBe(1)
    expect(skirtElevationAt(MASK4, STEP4, 90)).toBe(3)
    expect(skirtElevationAt(MASK4, STEP4, 270)).toBe(5)
  })

  it('interpolates between samples', () => {
    expect(skirtElevationAt(MASK4, STEP4, 45)).toBeCloseTo(2, 12)
    expect(skirtElevationAt(MASK4, STEP4, 135)).toBeCloseTo(1.5, 12)
  })

  it('wraps from the last sample to the first at 360 degrees', () => {
    expect(skirtElevationAt(MASK4, STEP4, 315)).toBeCloseTo(3, 12)
    expect(skirtElevationAt(MASK4, STEP4, 360)).toBeCloseTo(1, 12)
    expect(skirtElevationAt(MASK4, STEP4, -45)).toBeCloseTo(3, 12)
    expect(skirtElevationAt(MASK4, STEP4, 405)).toBeCloseTo(2, 12)
  })

  it('is the same function as the sky plot horizon', () => {
    for (const az of [0, 12.3, 33.3, 179.9, 359.99]) {
      expect(skirtElevationAt(MASK720, 0.5, az)).toBe(horizonAt(MASK720, 0.5, az))
    }
  })
})

describe('visibility agrees with the clearance of the data', () => {
  const sunDirs: [number, number][] = [
    [33.3, 1.25],
    [33.3, 6],
    [33.3, 5.9],
    [90, 0.4],
    [90, 0.6],
    [359.9, 0.7],
    [0.2, 0.3],
    [200, -1],
    [200, 0.5],
    [20, 3.3],
  ]

  it('a body is above the skirt exactly when its clearance is not negative', () => {
    for (const [az, el] of sunDirs) {
      const clearance = el - horizonAt(MASK720, 0.5, az)
      expect(bodyClearsHorizon(MASK720, 0.5, az, el)).toBe(clearance >= 0)
    }
  })

  it('matches the Sun visible readout of the HUD', () => {
    for (const [az, el] of sunDirs) {
      const readout = describeBody({ az, el }, MASK720, 0.5, 0.2666)
      expect(bodyClearsHorizon(MASK720, 0.5, az, el)).toBe(readout.visible)
      expect(readout.clearance >= 0).toBe(readout.visible)
    }
  })

  it('the reported case: Sun 1.25 deg up behind a 2.45 deg horizon is hidden', () => {
    const mask = new Array(720).fill(2.45)
    expect(bodyClearsHorizon(mask, 0.5, 33.3, 1.25)).toBe(false)
    expect(bodyClearsHorizon(mask, 0.5, 33.3, 2.5)).toBe(true)
  })
})

describe('skirt geometry', () => {
  it('closes the ring', () => {
    const p = skirtProfile(MASK720, 0.5, 720)
    expect(p.length).toBe(721)
    expect(p[720]).toBeCloseTo(p[0], 6)
    expect(p[66]).toBeCloseTo(6, 6)
  })

  it('puts the top edge on the mask and the bottom edge under the horizon, at the given radius', () => {
    const radius = 1000
    const pos = skirtPositions(skirtProfile(MASK4, STEP4, 4), radius)
    // vertex pair 1 is azimuth 90 degrees (east): x east, z is minus north
    expect(pos[6]).toBeCloseTo(radius, 6)
    expect(pos[8]).toBeCloseTo(0, 6)
    expect(pos[7]).toBeCloseTo(radius * Math.tan((3 * Math.PI) / 180), 4)
    expect(pos[10]).toBeCloseTo(radius * Math.tan((SKIRT_BOTTOM_EL_DEG * Math.PI) / 180), 4)
    // azimuth 0 (north) is -z
    expect(pos[2]).toBeCloseTo(-radius, 6)
  })
})
