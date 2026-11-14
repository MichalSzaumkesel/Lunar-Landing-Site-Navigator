/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_START_UTC } from '../config/presets'
import { DATA_END_MS, DATA_START_MS } from '../config/dataRange'
import { decodeHeights } from '../viz3d/terrain'
import { localSunlitGrid } from '../viz3d/localIllum'
import { horizonFromTerrain } from '../viz3d/terrainHorizon'
import { isValidEarthOrientation } from './earthOrientation'
import type { EarthOrientationFile } from './earthOrientation'
import { findWindows } from './finder'
import { computeMetrics } from './metrics'
import { PRESET_SLIP } from '../config/presets'
import { isValidEphem, isValidHorizon, isValidTerrain } from './loader'
import type { EphemFile, HorizonFile, SitesFile, TerrainFile } from './types'
import { computeWindowMap, windowsFromRow } from './windowMap'

// Loads every real file of scope A through the validation the app uses. Skipped when the files are absent.

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data')
const hasReal = existsSync(resolve(dataDir, 'sites.json'))
const read = <T>(rel: string): T => JSON.parse(readFileSync(resolve(dataDir, rel), 'utf-8')) as T

const CATEGORIES = ['apollo', 'clps', 'commercial', 'international', 'artemis_region']
const STATUSES = ['landed', 'crashed', 'planned', 'candidate_region']
const nullableString = (v: unknown) => v === null || (typeof v === 'string' && v.length > 0)

describe.skipIf(!hasReal)('real data files (scope A)', () => {
  const sitesFile = read<SitesFile>('sites.json')
  const ids = sitesFile.sites.map((s) => s.id)
  const rules = {
    observerHeightM: 2 as const,
    missionDurationH: 240,
    minPctSunlit: 70,
    maxLongestDarkH: 48,
    earthAtLandingRequired: true,
    minPctEarth: 50,
  }

  it('sites.json: 21 unique sites with the fields the UI relies on', () => {
    expect(ids.length).toBe(21)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of sitesFile.sites) {
      expect(s.id).toMatch(/^[a-z0-9_]+$/)
      expect(s.name.length).toBeGreaterThan(0)
      expect(CATEGORIES).toContain(s.category)
      expect(STATUSES).toContain(s.status)
      expect(s.lat_deg).toBeGreaterThanOrEqual(-90)
      expect(s.lat_deg).toBeLessThanOrEqual(90)
      expect(s.lon_deg).toBeGreaterThanOrEqual(-180)
      expect(s.lon_deg).toBeLessThanOrEqual(180)
      expect(nullableString(s.mission)).toBe(true)
      expect(nullableString(s.agency)).toBe(true)
      expect(nullableString(s.country)).toBe(true)
      expect(s.elevation_m === null || Number.isFinite(s.elevation_m)).toBe(true)
      expect(s.landing_date_utc === null || Number.isFinite(Date.parse(s.landing_date_utc))).toBe(true)
      expect(s.source.url).toMatch(/^https:\/\//)
      expect(s.source.title.length).toBeGreaterThan(0)
      expect(sitesFile.meta.synthetic).toBe(false)
    }
  })

  it.each(ids)('%s: horizon and ephemeris pass the app validators and are inside plausible ranges', (id) => {
    const h = read<HorizonFile>(`horizon/${id}.json`)
    const e = read<EphemFile>(`ephem/${id}.json`)
    expect(isValidHorizon(h)).toBe(true)
    expect(isValidEphem(e)).toBe(true)
    expect(h.site_id).toBe(id)
    expect(e.site_id).toBe(id)
    expect(h.meta.synthetic).toBe(false)
    expect(e.meta.synthetic).toBe(false)
    expect(Object.keys(h.masks).sort()).toEqual(['10', '2'])
    expect(h.n * h.az_step_deg).toBeCloseTo(360, 9)
    for (const mask of Object.values(h.masks)) {
      expect(Math.min(...mask)).toBeGreaterThan(-15)
      expect(Math.max(...mask)).toBeLessThan(45)
    }
    expect(Date.parse(e.start_utc)).toBe(DATA_START_MS)
    expect(Date.parse(e.start_utc) + (e.count - 1) * e.step_minutes * 60_000).toBe(DATA_END_MS)
    for (const track of [e.sun, e.earth]) {
      expect(Math.min(...track.az)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...track.az)).toBeLessThan(360)
      expect(Math.min(...track.el)).toBeGreaterThanOrEqual(-90)
      expect(Math.max(...track.el)).toBeLessThanOrEqual(90)
    }
    expect(e.sun_ang_radius_deg).toBeCloseTo(0.2666, 3)
    expect(e.earth_ang_radius_deg).toBeGreaterThan(0.8)
    expect(e.earth_ang_radius_deg).toBeLessThan(1.1)
  })

  const terrainIds = ids.filter((id) => existsSync(resolve(dataDir, `terrain/${id}.json`)))

  it('terrain exists for the three demo sites', () => {
    for (const id of ['apollo_11', 'artemis_region_1', 'southpole_landed']) expect(terrainIds).toContain(id)
  })

  it.each(terrainIds)('%s: terrain json and bin decode, the site sits at the centre at z = 0', (id) => {
    const t = read<TerrainFile>(`terrain/${id}.json`)
    expect(isValidTerrain(t)).toBe(true)
    expect(t.meta.synthetic).toBe(false)
    const buf = readFileSync(resolve(dataDir, t.bin))
    const heights = decodeHeights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), t)
    expect(heights.length).toBe(t.size_px * t.size_px)
    const c = t.size_px / 2
    expect(Math.abs(heights[c * t.size_px + c])).toBeLessThan(60)
    // The skirt wall stands at SKIRT_RADIUS_M (40 km); the patch corner must stay well inside it.
    expect((t.size_px / 2) * t.spacing_m * Math.SQRT2).toBeLessThan(28_000)
  })

  it.each(['apollo_11', 'artemis_region_1', 'southpole_landed'])(
    '%s: terrain skyline agrees with the horizon mask in azimuth, not mirrored',
    (id) => {
      const t = read<TerrainFile>(`terrain/${id}.json`)
      const h = read<HorizonFile>(`horizon/${id}.json`)
      const buf = readFileSync(resolve(dataDir, t.bin))
      const heights = decodeHeights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), t)
      const terr = horizonFromTerrain(heights, t.size_px, t.spacing_m, 0, 0, 2, { rays: 720 })
      const mask = h.masks['2']
      const corr = (f: (i: number) => number) => {
        let sa = 0
        let sb = 0
        let saa = 0
        let sbb = 0
        let sab = 0
        for (let i = 0; i < 720; i++) {
          const a = terr[i]
          const b = mask[f(i)]
          sa += a
          sb += b
          saa += a * a
          sbb += b * b
          sab += a * b
        }
        const n = 720
        return (sab - (sa * sb) / n) / Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n))
      }
      const same = corr((i) => i)
      const eastWestFlip = corr((i) => (720 - i) % 720)
      const northSouthFlip = corr((i) => (360 - i + 720) % 720)
      console.info(`${id}: corr identity ${same.toFixed(2)}, E-W flip ${eastWestFlip.toFixed(2)}, N-S flip ${northSouthFlip.toFixed(2)}`)
      expect(same).toBeGreaterThan(eastWestFlip)
      expect(same).toBeGreaterThan(northSouthFlip)
      expect(same).toBeGreaterThan(0.5)
    },
  )

  it.each(['southpole_landed'])(
    '%s: the local illumination heatmap on the real patch is fast and varies over the patch',
    (id) => {
      const t = read<TerrainFile>(`terrain/${id}.json`)
      const ephem = read<EphemFile>(`ephem/${id}.json`)
      const buf = readFileSync(resolve(dataDir, t.bin))
      const heights = decodeHeights(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), t)
      const extentM = t.size_px * t.spacing_m
      const gridN = Math.max(16, Math.min(64, Math.round(extentM / 500))) // as SurfaceView
      const startMs = Date.parse(DEFAULT_START_UTC)
      const t0 = performance.now()
      const grid = localSunlitGrid({
        heights,
        sizePx: t.size_px,
        spacingM: t.spacing_m,
        ephem,
        observerHeightM: 2,
        startMs,
        endMs: startMs + 30 * 86_400_000,
        gridN,
        extentM,
        rays: 360,
      })
      const ms = performance.now() - t0
      console.info(`${id}: heatmap ${gridN}x${gridN} on ${t.size_px}px patch ${ms.toFixed(0)} ms, ${Math.min(...grid).toFixed(0)}..${Math.max(...grid).toFixed(0)} % sunlit`)
      expect(grid.length).toBe(gridN * gridN)
      expect(ms).toBeLessThan(20_000)
    },
  )

  it('earth_orientation.json passes validation and stays in physical ranges', () => {
    const o = read<EarthOrientationFile>('earth_orientation.json')
    expect(isValidEarthOrientation(o)).toBe(true)
    expect(Date.parse(o.start_utc)).toBe(DATA_START_MS)
    expect(o.step_minutes).toBe(60)
    expect(o.count).toBe(18288)
    expect(Math.min(...o.sub_lunar_lon_deg)).toBeGreaterThanOrEqual(-180)
    expect(Math.max(...o.sub_lunar_lon_deg)).toBeLessThanOrEqual(180)
    expect(Math.abs(Math.min(...o.sub_lunar_lat_deg))).toBeLessThan(30)
    expect(Math.max(...o.sub_lunar_lat_deg)).toBeLessThan(30)
    expect(Math.min(...o.pole_pa_deg)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...o.pole_pa_deg)).toBeLessThan(360)
    // Earth turns east once per day, so the sub-lunar longitude moves west by about 360 - 12.2 deg per day;
    // wrapped to -180..180 that is a step of about +12 deg.
    const d = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180
    const perDay = d(o.sub_lunar_lon_deg[0], o.sub_lunar_lon_deg[24])
    expect(perDay).toBeGreaterThan(9)
    expect(perDay).toBeLessThan(15)
  })

  it('the default start and 30-day demo window are inside the coverage', () => {
    const start = Date.parse(DEFAULT_START_UTC)
    expect(start).toBeGreaterThanOrEqual(DATA_START_MS)
    expect(start + 30 * 86_400_000).toBeLessThanOrEqual(DATA_END_MS)
  })

  it('slip preset: 14-day mission at southpole_landed from 2027-01-01 and +14 days (pitch 4c)', () => {
    const bundle = { horizon: read<HorizonFile>('horizon/southpole_landed.json'), ephem: read<EphemFile>('ephem/southpole_landed.json') }
    const [a, b] = PRESET_SLIP.scenarios
    const run = (sc: typeof a) => {
      const startMs = Date.parse(sc.startUtc ?? '') + (sc.slipDays ?? 0) * 86_400_000
      return computeMetrics(bundle, { observerHeightM: 2, startMs, endMs: startMs + (sc.durationH ?? 0) * 3_600_000 })
    }
    const m0 = run(a)
    const m14 = run(b)
    expect(m0?.pct_sunlit).toBeCloseTo(6.8, 0)
    expect(m0?.longest_dark_h).toBeCloseTo(313, -1)
    expect(m14?.pct_sunlit).toBeCloseTo(94.0, 0)
    expect(m14?.longest_dark_h).toBeCloseTo(20, -1)
  })

  it.each(['apollo_11', 'southpole_landed', 'artemis_region_2'])(
    '%s: window lists from the hourly window map equal findWindows',
    (id) => {
      const bundle = { horizon: read<HorizonFile>(`horizon/${id}.json`), ephem: read<EphemFile>(`ephem/${id}.json`) }
      const row = computeWindowMap([{ siteId: id, bundle }], rules, { dayStepH: 1 })[0]
      expect(windowsFromRow(row)).toEqual(findWindows(bundle, rules))
    },
  )

  it('window map for all sites runs in well under a few seconds', () => {
    const inputs = ids.map((id) => ({
      siteId: id,
      bundle: { horizon: read<HorizonFile>(`horizon/${id}.json`), ephem: read<EphemFile>(`ephem/${id}.json`) },
    }))
    const t0 = performance.now()
    const rows = computeWindowMap(inputs, rules, { dayStepH: 24 })
    const mapMs = performance.now() - t0
    expect(rows.length).toBe(21)
    expect(rows[0].count).toBeGreaterThan(600)
    const t1 = performance.now()
    const hourly = computeWindowMap(inputs, rules, { dayStepH: 1 })
    const hourlyMs = performance.now() - t1
    const windows = hourly.reduce((n, r) => n + windowsFromRow(r).length, 0)
    console.info(`computeWindowMap 21 sites: daily ${mapMs.toFixed(0)} ms, hourly ${hourlyMs.toFixed(0)} ms (${windows} windows)`)
    expect(mapMs + hourlyMs).toBeLessThan(10_000)
  })
})
