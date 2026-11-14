import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { EphemFile, Site, SitesFile } from './types'
import {
  bodyPositionKm,
  elevationAt,
  elevationGrid,
  subpoint,
  terminatorLine,
} from './moonFrame'

describe('moonFrame helpers', () => {
  const equatorSite: Site = {
    id: 'equator_test',
    name: 'Equator test',
    category: 'custom',
    mission: null,
    agency: null,
    country: null,
    lat_deg: 0,
    lon_deg: 0,
    elevation_m: 0,
    landing_date_utc: null,
    status: 'planned',
    region_radius_km: null,
    source: { title: '', url: '' },
    notes: '',
  }

  const startUtc = '2027-01-01T00:00:00Z'
  const startMs = Date.parse(startUtc)

  // Hand-built tiny ephemeris (3 samples, hourly) with Sun straight overhead at sample 0
  const tinyEphem: EphemFile = {
    meta: {
      contract_version: '1.1.1',
      generated_utc: startUtc,
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'equator_test',
    start_utc: startUtc,
    step_minutes: 60,
    count: 3,
    sun: {
      az: [0, 90, 90],
      el: [90, 89.5, 89.0],
    },
    earth: {
      az: [0, 0, 0],
      el: [0, 0, 0],
    },
    sun_ang_radius_deg: 0.26,
    earth_ang_radius_deg: 0.95,
  }

  it('subpoint, elevationAt and antipode for overhead Sun', () => {
    const sunKm = bodyPositionKm({ site: equatorSite, ephem: tinyEphem }, 'sun', startMs)
    expect(sunKm).not.toBeNull()
    if (!sunKm) return

    // Subpoint directly under the Sun is about (0, 0)
    const sp = subpoint(sunKm)
    expect(sp.lat_deg).toBeCloseTo(0, 4)
    expect(sp.lon_deg).toBeCloseTo(0, 4)

    // Directly under the body: elevation ~ 90
    expect(elevationAt(0, 0, sunKm)).toBeCloseTo(90, 4)

    // 90 degrees away: elevation is about 0 (tolerance 0.01)
    expect(Math.abs(elevationAt(0, 90, sunKm))).toBeLessThan(0.01)

    // Antipode (opposite side of the Moon): elevation is about -90
    expect(elevationAt(0, 180, sunKm)).toBeCloseTo(-90, 4)
  })

  it('terminatorLine points have elevation near 0 and split where longitude wraps', () => {
    const sunKm = bodyPositionKm({ site: equatorSite, ephem: tinyEphem }, 'sun', startMs)
    expect(sunKm).not.toBeNull()
    if (!sunKm) return

    const line = terminatorLine(sunKm)
    expect(line.length).toBe(181)

    // All points on terminator have elevation within 0.5 degrees of 0
    for (const pt of line) {
      expect(Math.abs(elevationAt(pt.lat_deg, pt.lon_deg, sunKm))).toBeLessThan(0.5)
    }

    // Test a body position whose terminator circle crosses +-180
    // E.g. subpoint at lat 30, lon 100
    const phi = 30 * (Math.PI / 180)
    const lam = 100 * (Math.PI / 180)
    const L = 149597870.7
    const customSunKm: [number, number, number] = [
      L * Math.cos(phi) * Math.cos(lam),
      L * Math.cos(phi) * Math.sin(lam),
      L * Math.sin(phi),
    ]

    const wrappedLine = terminatorLine(customSunKm, 181)
    expect(wrappedLine.length).toBe(181)

    // Every point has elevation near 0
    for (const pt of wrappedLine) {
      expect(Math.abs(elevationAt(pt.lat_deg, pt.lon_deg, customSunKm))).toBeLessThan(0.5)
    }

    // Verify there is no +-180 wrap between adjacent points in the returned polyline
    for (let i = 1; i < wrappedLine.length; i++) {
      const prev = wrappedLine[i - 1].lon_deg
      const curr = wrappedLine[i].lon_deg
      const isWrap =
        (prev > 90 && curr < -90) || (prev < -90 && curr > 90)
      expect(isWrap).toBe(false)
    }
  })

  it('elevationGrid cell-centre latitudes and longitudes', () => {
    const sunKm = bodyPositionKm({ site: equatorSite, ephem: tinyEphem }, 'sun', startMs)
    expect(sunKm).not.toBeNull()
    if (!sunKm) return

    const nLat = 18
    const nLon = 36
    const grid = elevationGrid(sunKm, nLat, nLon)
    expect(grid.length).toBe(nLat * nLon)

    for (let r = 0; r < nLat; r++) {
      const latDeg = 90 - ((r + 0.5) * 180) / nLat
      for (let c = 0; c < nLon; c++) {
        const lonDeg = -180 + ((c + 0.5) * 360) / nLon
        const expected = elevationAt(latDeg, lonDeg, sunKm)
        expect(grid[r * nLon + c]).toBeCloseTo(expected, 2)
      }
    }
  })

  it('identity test on real mock southpole_landed ephemeris', () => {
    const sitesJson: SitesFile = JSON.parse(
      readFileSync('public/data/mock/sites.json', 'utf-8'),
    )
    const site = sitesJson.sites.find((s) => s.id === 'southpole_landed')
    expect(site).toBeDefined()
    if (!site) return

    const ephem: EphemFile = JSON.parse(
      readFileSync('public/data/mock/ephem/southpole_landed.json', 'utf-8'),
    )

    const ephemStartMs = Date.parse(ephem.start_utc)
    const testOffsetsH = [0, 24, 100]

    for (const offsetH of testOffsetsH) {
      const ms = ephemStartMs + offsetH * 3600000
      const idx = offsetH

      // Sun test: within 0.02 degrees
      const sunKm = bodyPositionKm({ site, ephem }, 'sun', ms)
      expect(sunKm).not.toBeNull()
      if (sunKm) {
        const calculatedSunEl = elevationAt(site.lat_deg, site.lon_deg, sunKm)
        const expectedSunEl = ephem.sun.el[idx]
        expect(Math.abs(calculatedSunEl - expectedSunEl)).toBeLessThan(0.02)
      }

      // Earth test: within 0.05 degrees
      const earthKm = bodyPositionKm({ site, ephem }, 'earth', ms)
      expect(earthKm).not.toBeNull()
      if (earthKm) {
        const calculatedEarthEl = elevationAt(site.lat_deg, site.lon_deg, earthKm)
        const expectedEarthEl = ephem.earth.el[idx]
        expect(Math.abs(calculatedEarthEl - expectedEarthEl)).toBeLessThan(0.05)
      }
    }
  })

  it('elevationGrid performance bound under 20 ms for 180 by 90 cells', () => {
    const sunKm: [number, number, number] = [149597870.7, 0, 0]

    // Warm-up run
    elevationGrid(sunKm, 90, 180)

    const t0 = performance.now()
    const runs = 20
    for (let i = 0; i < runs; i++) {
      elevationGrid(sunKm, 90, 180)
    }
    const elapsedPerRun = (performance.now() - t0) / runs

    expect(elapsedPerRun).toBeLessThan(20)
  })
})
