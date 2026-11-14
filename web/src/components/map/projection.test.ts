import { describe, expect, it } from 'vitest'
import {
  equirectangularProject,
  equirectangularUnproject,
  isInPolarInset,
  MAP_HEIGHT,
  MAP_WIDTH,
  POLAR_INSET_CX,
  POLAR_INSET_CY,
  POLAR_INSET_RADIUS,
  polarInsetProject,
  polarInsetUnproject,
} from './projection'

describe('projection', () => {
  describe('equirectangular projection', () => {
    it('projects corners and center correctly', () => {
      // Top-left: lat 90, lon -180 -> (0, 0)
      const tl = equirectangularProject(90, -180)
      expect(tl.x).toBeCloseTo(0)
      expect(tl.y).toBeCloseTo(0)

      // Top-right: lat 90, lon 180 -> (720, 0)
      const tr = equirectangularProject(90, 180)
      expect(tr.x).toBeCloseTo(MAP_WIDTH)
      expect(tr.y).toBeCloseTo(0)

      // Bottom-left: lat -90, lon -180 -> (0, 360)
      const bl = equirectangularProject(-90, -180)
      expect(bl.x).toBeCloseTo(0)
      expect(bl.y).toBeCloseTo(MAP_HEIGHT)

      // Bottom-right: lat -90, lon 180 -> (720, 360)
      const br = equirectangularProject(-90, 180)
      expect(br.x).toBeCloseTo(MAP_WIDTH)
      expect(br.y).toBeCloseTo(MAP_HEIGHT)

      // Center: lat 0, lon 0 -> (360, 180)
      const center = equirectangularProject(0, 0)
      expect(center.x).toBeCloseTo(360)
      expect(center.y).toBeCloseTo(180)
    })

    it('unprojects corners and center correctly', () => {
      const c1 = equirectangularUnproject(0, 0)
      expect(c1.lat).toBeCloseTo(90)
      expect(c1.lon).toBeCloseTo(-180)

      const c2 = equirectangularUnproject(MAP_WIDTH, 0)
      expect(c2.lat).toBeCloseTo(90)
      expect(c2.lon).toBeCloseTo(180)

      const c3 = equirectangularUnproject(0, MAP_HEIGHT)
      expect(c3.lat).toBeCloseTo(-90)
      expect(c3.lon).toBeCloseTo(-180)

      const c4 = equirectangularUnproject(MAP_WIDTH, MAP_HEIGHT)
      expect(c4.lat).toBeCloseTo(-90)
      expect(c4.lon).toBeCloseTo(180)

      const center = equirectangularUnproject(360, 180)
      expect(center.lat).toBeCloseTo(0)
      expect(center.lon).toBeCloseTo(0)
    })

    it('round-trips equirectangular projection across various coordinates', () => {
      const testPoints = [
        { lat: 0, lon: 0 },
        { lat: 45, lon: 90 },
        { lat: -45, lon: -90 },
        { lat: -89.5, lon: 45.0 },
        { lat: 89.9, lon: -179.9 },
        { lat: -90, lon: 0 },
        { lat: 90, lon: 0 },
      ]

      for (const pt of testPoints) {
        const projected = equirectangularProject(pt.lat, pt.lon)
        const unprojected = equirectangularUnproject(projected.x, projected.y)
        expect(unprojected.lat).toBeCloseTo(pt.lat, 4)
        expect(unprojected.lon).toBeCloseTo(pt.lon, 4)
      }
    })
  })

  describe('polar inset projection', () => {
    it('projects south pole to inset center and points on rim to radius', () => {
      // South pole: lat -90
      const pole = polarInsetProject(-90, 0)
      expect(pole.x).toBeCloseTo(POLAR_INSET_CX)
      expect(pole.y).toBeCloseTo(POLAR_INSET_CY)

      // Rim: lat -60 at lon 0 (points up)
      const rimNorth = polarInsetProject(-60, 0)
      expect(rimNorth.x).toBeCloseTo(POLAR_INSET_CX)
      expect(rimNorth.y).toBeCloseTo(POLAR_INSET_CY - POLAR_INSET_RADIUS)

      // Rim: lat -60 at lon 90 (points right)
      const rimEast = polarInsetProject(-60, 90)
      expect(rimEast.x).toBeCloseTo(POLAR_INSET_CX + POLAR_INSET_RADIUS)
      expect(rimEast.y).toBeCloseTo(POLAR_INSET_CY)

      // Rim: lat -60 at lon 180 (points down)
      const rimSouth = polarInsetProject(-60, 180)
      expect(rimSouth.x).toBeCloseTo(POLAR_INSET_CX)
      expect(rimSouth.y).toBeCloseTo(POLAR_INSET_CY + POLAR_INSET_RADIUS)

      // Rim: lat -60 at lon -90 (points left)
      const rimWest = polarInsetProject(-60, -90)
      expect(rimWest.x).toBeCloseTo(POLAR_INSET_CX - POLAR_INSET_RADIUS)
      expect(rimWest.y).toBeCloseTo(POLAR_INSET_CY)
    })

    it('unprojects inset center to south pole', () => {
      const center = polarInsetUnproject(POLAR_INSET_CX, POLAR_INSET_CY)
      expect(center.lat).toBeCloseTo(-90)
    })

    it('round-trips polar inset projection for polar sites', () => {
      const polarTestCases = [
        { lat: -90, lon: 0 },
        { lat: -89.9, lon: 45 },
        { lat: -85.5, lon: -120 },
        { lat: -80.0, lon: 90 },
        { lat: -75.0, lon: -45 },
        { lat: -65.0, lon: 175 },
        { lat: -60.0, lon: 60 },
      ]

      for (const pt of polarTestCases) {
        const proj = polarInsetProject(pt.lat, pt.lon)
        const unproj = polarInsetUnproject(proj.x, proj.y)
        expect(unproj.lat).toBeCloseTo(pt.lat, 4)
        if (pt.lat !== -90) {
          expect(unproj.lon).toBeCloseTo(pt.lon, 4)
        }
      }
    })

    it('isInPolarInset correctly determines whether a point is inside the inset circle', () => {
      expect(isInPolarInset(POLAR_INSET_CX, POLAR_INSET_CY)).toBe(true)
      expect(isInPolarInset(POLAR_INSET_CX + POLAR_INSET_RADIUS - 1, POLAR_INSET_CY)).toBe(true)
      expect(isInPolarInset(POLAR_INSET_CX + POLAR_INSET_RADIUS, POLAR_INSET_CY)).toBe(true)
      expect(isInPolarInset(POLAR_INSET_CX + POLAR_INSET_RADIUS + 1, POLAR_INSET_CY)).toBe(false)
      expect(isInPolarInset(0, 0)).toBe(false)
      expect(isInPolarInset(360, 180)).toBe(false)
    })
  })
})
