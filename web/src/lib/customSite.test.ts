import { describe, expect, it } from 'vitest'
import {
  approximateCustomSite,
  customSiteId,
  formatCoord,
  parseCustomSiteId,
} from './customSite'
import type { EphemFile, HorizonFile, Site, SiteBundle } from './types'

function makeTestReferenceBundle(overrides?: {
  lat_deg?: number
  lon_deg?: number
  synthetic?: boolean
  sunAz?: number[]
  sunEl?: number[]
  earthAz?: number[]
  earthEl?: number[]
}): SiteBundle {
  const lat = overrides?.lat_deg ?? -89.9
  const lon = overrides?.lon_deg ?? 0.0
  const synthetic = overrides?.synthetic ?? false

  const site: Site = {
    id: 'test_ref_site',
    name: 'Test Reference Site',
    category: 'apollo',
    mission: 'Apollo 11',
    agency: 'NASA',
    country: 'USA',
    lat_deg: lat,
    lon_deg: lon,
    elevation_m: null,
    landing_date_utc: null,
    status: 'landed',
    region_radius_km: null,
    source: { title: 'Test Source', url: 'https://example.com' },
    notes: 'Reference site notes',
  }

  const horizon: HorizonFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test-gen',
      synthetic,
      approximate: false,
      inputs: [{ name: 'Test Dem', url: 'https://example.com' }],
    },
    site_id: 'test_ref_site',
    az_step_deg: 0.5,
    n: 720,
    observer_heights_m: [2, 10],
    masks: {
      '2': new Array(720).fill(1.2),
      '10': new Array(720).fill(1.0),
    },
  }

  const sunAz = overrides?.sunAz ?? [30, 45, 90]
  const sunEl = overrides?.sunEl ?? [5, 10, 15]
  const earthAz = overrides?.earthAz ?? [180, 190, 200]
  const earthEl = overrides?.earthEl ?? [40, 45, 50]
  const count = sunAz.length

  const ephem: EphemFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test-gen',
      synthetic,
      approximate: false,
      inputs: [{ name: 'JPL Horizons', url: 'https://ssd.jpl.nasa.gov' }],
    },
    site_id: 'test_ref_site',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count,
    sun: { az: sunAz, el: sunEl },
    earth: { az: earthAz, el: earthEl },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
  }

  return {
    site,
    horizon,
    ephem,
    terrain: null,
    provenance: synthetic ? 'mock' : 'real',
    synthetic,
    approximate: false,
  }
}

describe('customSite', () => {
  describe('coordinate formatting and ID generation', () => {
    it('formats coordinates with 3 decimals and replaces dot with p', () => {
      expect(formatCoord(-89.5)).toBe('-89p500')
      expect(formatCoord(45)).toBe('45p000')
      expect(formatCoord(0)).toBe('0p000')
      expect(formatCoord(-0)).toBe('0p000')
    })

    it('generates site id conforming to spec example', () => {
      expect(customSiteId(-89.5, 45)).toBe('custom_-89p500_45p000')
    })

    it('parses custom site ids correctly as the inverse of customSiteId', () => {
      expect(parseCustomSiteId('custom_-89p500_45p000')).toEqual({
        lat: -89.5,
        lon: 45,
      })
      expect(parseCustomSiteId('custom_0p000_0p000')).toEqual({
        lat: 0,
        lon: 0,
      })
      expect(parseCustomSiteId('custom_90p000_180p000')).toEqual({
        lat: 90,
        lon: 180,
      })
      expect(parseCustomSiteId('custom_-90p000_-180p000')).toEqual({
        lat: -90,
        lon: -180,
      })
      // Round trip check
      const testCases = [
        [-89.5, 45.0],
        [0.0, 0.0],
        [15.234, -45.678],
        [-90.0, 180.0],
        [90.0, -180.0],
      ]
      for (const [lat, lon] of testCases) {
        const id = customSiteId(lat, lon)
        const parsed = parseCustomSiteId(id)
        expect(parsed).toEqual({ lat, lon })
      }
    })

    it('returns null for invalid or out-of-range custom site ids', () => {
      expect(parseCustomSiteId('custom_90p001_0p000')).toBeNull()
      expect(parseCustomSiteId('custom_-90p001_0p000')).toBeNull()
      expect(parseCustomSiteId('custom_0p000_180p001')).toBeNull()
      expect(parseCustomSiteId('custom_0p000_-180p001')).toBeNull()
      expect(parseCustomSiteId('southpole_landed')).toBeNull()
      expect(parseCustomSiteId('custom_abc_def')).toBeNull()
      expect(parseCustomSiteId('custom_10_20_30')).toBeNull()
      expect(parseCustomSiteId('custom_')).toBeNull()
      expect(parseCustomSiteId('')).toBeNull()
      expect(parseCustomSiteId('custom_NaN_0p000')).toBeNull()
    })
  })

  describe('approximateCustomSite', () => {
    it('Identity: custom site at reference coordinates reproduces reference az/el within 0.01 deg (Sun) and 0.05 deg (Earth)', () => {
      const ref = makeTestReferenceBundle({
        lat_deg: -89.9,
        lon_deg: 45.0,
        sunAz: [15, 60, 180, 270],
        sunEl: [1.5, 10.2, 5.0, 0.5],
        earthAz: [45, 120, 210, 315],
        earthEl: [35.0, 42.5, 50.1, 48.2],
      })

      const custom = approximateCustomSite(ref.site.lat_deg, ref.site.lon_deg, ref)

      expect(custom.ephem.count).toBe(ref.ephem.count)
      for (let i = 0; i < ref.ephem.count; i++) {
        const sunAzDiff = Math.abs(custom.ephem.sun.az[i] - ref.ephem.sun.az[i])
        const sunElDiff = Math.abs(custom.ephem.sun.el[i] - ref.ephem.sun.el[i])
        expect(sunAzDiff).toBeLessThanOrEqual(0.01)
        expect(sunElDiff).toBeLessThanOrEqual(0.01)

        const earthAzDiff = Math.abs(custom.ephem.earth.az[i] - ref.ephem.earth.az[i])
        const earthElDiff = Math.abs(custom.ephem.earth.el[i] - ref.ephem.earth.el[i])
        expect(earthAzDiff).toBeLessThanOrEqual(0.05)
        expect(earthElDiff).toBeLessThanOrEqual(0.05)
      }
    })

    it('Geometry: reference at lat 0, lon 0 with Sun at el 90; custom site at lat 0, lon 90 sees Sun at el ~ 0', () => {
      const ref = makeTestReferenceBundle({
        lat_deg: 0,
        lon_deg: 0,
        sunAz: [0],
        sunEl: [90],
        earthAz: [0],
        earthEl: [0],
      })

      const custom = approximateCustomSite(0, 90, ref)

      // At lat 0, lon 90, zenith at (0, 0) is 90 degrees away on the horizon (elevation ~ 0)
      expect(Math.abs(custom.ephem.sun.el[0] - 0)).toBeLessThanOrEqual(0.01)
      // Sun should be towards the west (azimuth 270)
      expect(Math.abs(custom.ephem.sun.az[0] - 270)).toBeLessThanOrEqual(0.01)
    })

    it('Horizon masks have 720 entries of about -0.086 (2 m) and -0.193 (10 m)', () => {
      const ref = makeTestReferenceBundle()
      const custom = approximateCustomSite(-85.0, 30.0, ref)

      expect(custom.horizon.n).toBe(720)
      expect(custom.horizon.az_step_deg).toBe(0.5)
      expect(custom.horizon.observer_heights_m).toEqual([2, 10])

      const mask2 = custom.horizon.masks['2']
      const mask10 = custom.horizon.masks['10']

      expect(mask2).toHaveLength(720)
      expect(mask10).toHaveLength(720)

      // dip(2m) = ~ -0.087, dip(10m) = ~ -0.194
      for (let i = 0; i < 720; i++) {
        expect(mask2[i]).toBeCloseTo(-0.0869, 2)
        expect(mask10[i]).toBeCloseTo(-0.194, 2)
      }
    })

    it('Flags: approximate is true, synthetic follows the reference, provenance is custom_approx', () => {
      const refReal = makeTestReferenceBundle({ synthetic: false })
      const customReal = approximateCustomSite(-80.0, 10.0, refReal)

      expect(customReal.provenance).toBe('custom_approx')
      expect(customReal.approximate).toBe(true)
      expect(customReal.synthetic).toBe(false)
      expect(customReal.horizon.meta.approximate).toBe(true)
      expect(customReal.horizon.meta.synthetic).toBe(false)
      expect(customReal.ephem.meta.approximate).toBe(true)
      expect(customReal.ephem.meta.synthetic).toBe(false)
      expect(customReal.terrain).toBeNull()

      const refSynthetic = makeTestReferenceBundle({ synthetic: true })
      const customSynth = approximateCustomSite(-80.0, 10.0, refSynthetic)

      expect(customSynth.provenance).toBe('custom_approx')
      expect(customSynth.approximate).toBe(true)
      expect(customSynth.synthetic).toBe(true)
      expect(customSynth.horizon.meta.synthetic).toBe(true)
      expect(customSynth.ephem.meta.synthetic).toBe(true)
    })

    it('constructs site, metadata and inputs properly', () => {
      const ref = makeTestReferenceBundle()
      const custom = approximateCustomSite(-89.5, 45.0, ref)

      expect(custom.site.id).toBe('custom_-89p500_45p000')
      expect(custom.site.name).toBe('Custom site (-89.500, 45.000)')
      expect(custom.site.category).toBe('custom')
      expect(custom.site.lat_deg).toBe(-89.5)
      expect(custom.site.lon_deg).toBe(45.0)
      expect(custom.site.status).toBe('planned')
      expect(custom.site.mission).toBeNull()
      expect(custom.site.agency).toBeNull()
      expect(custom.site.country).toBeNull()
      expect(custom.site.elevation_m).toBeNull()
      expect(custom.site.landing_date_utc).toBeNull()
      expect(custom.site.region_radius_km).toBeNull()
      expect(custom.site.notes).toContain(ref.site.id)

      expect(custom.horizon.meta.generator).toBe('web/src/lib/customSite.ts')
      expect(custom.horizon.meta.generated_utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      expect(custom.horizon.meta.inputs[0].name).toBe('Smooth-sphere horizon')
      expect(custom.horizon.meta.inputs[1].name).toBe(`Ephemeris rotated from ${ref.site.id}`)
    })
  })
})
