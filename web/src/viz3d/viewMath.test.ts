import { describe, expect, it } from 'vitest'
import { earthIlluminatedFraction } from '../lib/earthPhase'
import { directionEnu } from './terrain'
import {
  belowHorizonText,
  bodyAngularRadiusDeg,
  clampSize,
  earthLitFraction,
  faceTarget,
  horizonGlowStrength,
  overviewFaceTarget,
  lookAnglesTo,
  simpleSunText,
  sizeLabel,
  sizeValueText,
} from './viewMath'

describe('faceTarget', () => {
  it('puts a high body a third from the top: pitch is elevation minus 10 degrees', () => {
    const t = faceTarget(120, 40)
    expect(t.azimuthDeg).toBe(120)
    expect(t.pitchDeg).toBeCloseTo(30, 9)
    expect(t.belowHorizon).toBe(false)
    expect(t.belowDeg).toBe(0)
  })

  it('never looks below the horizon line', () => {
    expect(faceTarget(10, 5).pitchDeg).toBe(0)
    expect(faceTarget(10, 0.3).pitchDeg).toBe(0)
    expect(faceTarget(10, 14).pitchDeg).toBeCloseTo(4, 9)
  })

  it('keeps the azimuth and reports the depth for a body below the horizon', () => {
    const t = faceTarget(33.3, -3.2)
    expect(t.azimuthDeg).toBeCloseTo(33.3, 9)
    expect(t.pitchDeg).toBe(0)
    expect(t.belowHorizon).toBe(true)
    expect(t.belowDeg).toBeCloseTo(3.2, 9)
    expect(belowHorizonText('Sun', t.belowDeg)).toBe('Sun is 3.2 deg below the horizon')
  })

  it('uses the terrain horizon when it is given', () => {
    const t = faceTarget(33.3, 1.25, 2.45)
    expect(t.belowHorizon).toBe(true)
    expect(t.belowDeg).toBeCloseTo(1.2, 9)
    expect(faceTarget(33.3, 3, 2.45).belowHorizon).toBe(false)
    expect(faceTarget(33.3, 2.45, 2.45).belowHorizon).toBe(false)
  })

  it('normalises azimuths', () => {
    expect(faceTarget(-90, 20).azimuthDeg).toBe(270)
    expect(faceTarget(370, 20).azimuthDeg).toBe(10)
  })
})

describe('size slider', () => {
  it('clamps to 1x..20x', () => {
    expect(clampSize(0)).toBe(1)
    expect(clampSize(7.5)).toBe(7.5)
    expect(clampSize(99)).toBe(20)
  })

  it('maps the slider value to an angular radius about the true radius', () => {
    expect(bodyAngularRadiusDeg(0.2666, 1)).toBeCloseTo(0.2666, 12)
    expect(bodyAngularRadiusDeg(0.95, 4)).toBeCloseTo(3.8, 12)
    expect(bodyAngularRadiusDeg(0.95, 20)).toBeCloseTo(19, 12)
    expect(bodyAngularRadiusDeg(0.95, 50)).toBeCloseTo(19, 12)
  })

  it('labels the readout', () => {
    expect(sizeLabel(1)).toBe('True size')
    expect(sizeLabel(4)).toBe('4x')
    expect(sizeLabel(4.5)).toBe('4.5x')
    expect(sizeValueText(1)).toBe('True size')
    expect(sizeValueText(4)).toBe('4 times true size')
  })
})

describe('earthLitFraction', () => {
  const cases: [number, number, number, number][] = [
    [30, 9, 140, 25],
    [0, 0, 180, 0],
    [90, 45, 90, 45],
    [10, 60, 200, -5],
    [250, 3, 255, 10],
    [0, 80, 180, 80],
  ]
  it('agrees with the Earth lit readout formula for the same directions', () => {
    for (const [sa, se, ea, ee] of cases) {
      const ours = earthLitFraction(directionEnu(sa, se), directionEnu(ea, ee))
      const readout = earthIlluminatedFraction({ az: sa, el: se }, { az: ea, el: ee })
      expect(ours).toBeCloseTo(readout, 9)
    }
  })

  it('is new when the Sun is behind the Earth and full when opposite', () => {
    expect(earthLitFraction(directionEnu(40, 20), directionEnu(40, 20))).toBeCloseTo(0, 12)
    expect(earthLitFraction(directionEnu(40, 20), directionEnu(220, -20))).toBeCloseTo(1, 12)
  })

  it('is half at a right angle', () => {
    expect(earthLitFraction(directionEnu(0, 0), directionEnu(90, 0))).toBeCloseTo(0.5, 12)
  })
})

describe('horizonGlowStrength', () => {
  it('is zero while any of the disc is above the horizon', () => {
    expect(horizonGlowStrength(0.5, 0.27)).toBe(0)
    expect(horizonGlowStrength(-0.2, 0.27)).toBe(0)
  })

  it('grows as the body sits just below the horizon and fades out with depth', () => {
    const near = horizonGlowStrength(-0.4, 0.27)
    const far = horizonGlowStrength(-6, 0.27)
    expect(near).toBeGreaterThan(far)
    expect(near).toBeLessThanOrEqual(1)
    expect(far).toBeGreaterThan(0)
    expect(horizonGlowStrength(-20, 0.27)).toBe(0)
  })
})

describe('overviewFaceTarget', () => {
  it('normalises the azimuth and lowers a high camera to the cap', () => {
    expect(overviewFaceTarget(-90, 37)).toEqual({ azimuthDeg: 270, elevationDeg: 25 })
    expect(overviewFaceTarget(725, 37).azimuthDeg).toBe(5)
  })
  it('keeps an already low elevation within the floor', () => {
    expect(overviewFaceTarget(10, 18).elevationDeg).toBe(18)
    expect(overviewFaceTarget(10, 2).elevationDeg).toBe(10)
  })
})

describe('lookAnglesTo', () => {
  it('looks north, east, south and down at the target', () => {
    expect(lookAnglesTo(0, -10, 0).azimuthDeg).toBeCloseTo(0)
    expect(lookAnglesTo(10, 0, 0).azimuthDeg).toBeCloseTo(90)
    expect(lookAnglesTo(0, 10, 0).azimuthDeg).toBeCloseTo(180)
    expect(lookAnglesTo(-10, 0, 0).azimuthDeg).toBeCloseTo(270)
    expect(lookAnglesTo(0, -10, -10).elevationDeg).toBeCloseTo(-45)
  })
})

describe('simpleSunText', () => {
  it('uses the fixed Sun phrases only', () => {
    expect(simpleSunText(true)).toBe('Sun visible')
    expect(simpleSunText(false)).toBe('Sun below horizon')
    expect(simpleSunText(false)).toBe('Sun below horizon')
    expect(simpleSunText(false)).not.toMatch(/hidden|the horizon/)
  })
})
