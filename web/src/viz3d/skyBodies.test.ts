import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  hiddenByHorizon,
  isBodyVisible,
  SKIRT_RADIUS_M,
  SKY_DIST_M,
  STAR_DIST_M,
} from './skyBodies'
import type { BodyPlacement } from './skyBodies'

describe('isBodyVisible (3D body disc setting visibility rule)', () => {
  const SUN_RADIUS = 0.2666
  const EARTH_RADIUS = 0.95

  describe('Sun disc setting behaviour', () => {
    it('is visible when well above the horizon (clearance > 0)', () => {
      expect(isBodyVisible(2.0, SUN_RADIUS)).toBe(true)
      expect(isBodyVisible(0.5, SUN_RADIUS)).toBe(true)
      expect(isBodyVisible(SUN_RADIUS, SUN_RADIUS)).toBe(true)
    })

    it('does NOT vanish when its centre passes the horizon line (clearance = 0)', () => {
      expect(isBodyVisible(0, SUN_RADIUS)).toBe(true)
    })

    it('remains visible while sinking partially below the horizon (-radius <= clearance < 0)', () => {
      expect(isBodyVisible(-0.1, SUN_RADIUS)).toBe(true)
      expect(isBodyVisible(-0.2, SUN_RADIUS)).toBe(true)
      expect(isBodyVisible(-SUN_RADIUS, SUN_RADIUS)).toBe(true)
    })

    it('vanishes only when the upper limb passes below the horizon line (clearance < -radius)', () => {
      expect(isBodyVisible(-SUN_RADIUS - 0.0001, SUN_RADIUS)).toBe(false)
      expect(isBodyVisible(-0.5, SUN_RADIUS)).toBe(false)
      expect(isBodyVisible(-2.0, SUN_RADIUS)).toBe(false)
    })
  })

  describe('Earth disc setting behaviour', () => {
    it('is visible when well above the horizon (clearance > 0)', () => {
      expect(isBodyVisible(5.0, EARTH_RADIUS)).toBe(true)
      expect(isBodyVisible(1.0, EARTH_RADIUS)).toBe(true)
      expect(isBodyVisible(EARTH_RADIUS, EARTH_RADIUS)).toBe(true)
    })

    it('does NOT vanish when its centre passes the horizon line (clearance = 0)', () => {
      expect(isBodyVisible(0, EARTH_RADIUS)).toBe(true)
    })

    it('remains visible while sinking partially below the horizon (-radius <= clearance < 0)', () => {
      expect(isBodyVisible(-0.3, EARTH_RADIUS)).toBe(true)
      expect(isBodyVisible(-0.6, EARTH_RADIUS)).toBe(true)
      expect(isBodyVisible(-EARTH_RADIUS, EARTH_RADIUS)).toBe(true)
    })

    it('vanishes only when the upper limb passes below the horizon line (clearance < -radius)', () => {
      expect(isBodyVisible(-EARTH_RADIUS - 0.0001, EARTH_RADIUS)).toBe(false)
      expect(isBodyVisible(-1.5, EARTH_RADIUS)).toBe(false)
      expect(isBodyVisible(-4.0, EARTH_RADIUS)).toBe(false)
    })
  })

  describe('ridge and valley horizon clearances', () => {
    it('correctly handles high ridges (+4 deg horizon)', () => {
      const horizonEl = 4.0
      // Sun centre at 4 deg -> clearance 0 -> visible
      expect(isBodyVisible(4.0 - horizonEl, SUN_RADIUS)).toBe(true)
      // Sun centre at 3.8 deg -> clearance -0.2 deg >= -0.2666 deg -> upper limb visible
      expect(isBodyVisible(3.8 - horizonEl, SUN_RADIUS)).toBe(true)
      // Sun centre at 3.7 deg -> clearance -0.3 deg < -0.2666 deg -> completely hidden
      expect(isBodyVisible(3.7 - horizonEl, SUN_RADIUS)).toBe(false)
    })

    it('correctly handles negative crater-rim horizon (-2 deg horizon)', () => {
      const horizonEl = -2.0
      // Sun centre at -1.5 deg -> clearance +0.5 deg -> visible
      expect(isBodyVisible(-1.5 - horizonEl, SUN_RADIUS)).toBe(true)
      // Sun centre at -2.0 deg -> clearance 0 deg -> visible
      expect(isBodyVisible(-2.0 - horizonEl, SUN_RADIUS)).toBe(true)
      // Sun centre at -2.2 deg -> clearance -0.2 deg >= -0.2666 deg -> visible
      expect(isBodyVisible(-2.2 - horizonEl, SUN_RADIUS)).toBe(true)
      // Sun centre at -2.3 deg -> clearance -0.3 deg < -0.2666 deg -> completely hidden
      expect(isBodyVisible(-2.3 - horizonEl, SUN_RADIUS)).toBe(false)
    })
  })
})

describe('hiddenByHorizon helper', () => {
  const dummyDir = new THREE.Vector3(0, 0, -1)

  it('hides the body when direction is null', () => {
    const p: BodyPlacement = {
      dir: null,
      elDeg: 10,
      hintDir: null,
      clearanceDeg: 10,
      angRadiusDeg: 0.2666,
    }
    expect(hiddenByHorizon(p)).toBe(true)
  })

  it('shows the body when clearance >= -angRadiusDeg', () => {
    const p: BodyPlacement = {
      dir: dummyDir,
      elDeg: 2.0,
      hintDir: null,
      clearanceDeg: -0.1,
      angRadiusDeg: 0.2666,
    }
    expect(hiddenByHorizon(p)).toBe(false)
  })

  it('hides the body when clearance < -angRadiusDeg', () => {
    const p: BodyPlacement = {
      dir: dummyDir,
      elDeg: 2.0,
      hintDir: null,
      clearanceDeg: -0.3,
      angRadiusDeg: 0.2666,
    }
    expect(hiddenByHorizon(p)).toBe(true)
  })
})

describe('skirt and sky body radius ordering', () => {
  it('places skirt wall (40 km) in front of sky bodies (60 km) so depth occlusion works below the mask', () => {
    expect(SKIRT_RADIUS_M).toBe(40_000)
    expect(SKY_DIST_M).toBe(60_000)
    expect(STAR_DIST_M).toBe(120_000)
    expect(SKIRT_RADIUS_M).toBeLessThan(SKY_DIST_M)
    expect(SKY_DIST_M).toBeLessThan(STAR_DIST_M)
  })
})
