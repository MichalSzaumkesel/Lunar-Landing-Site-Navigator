import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDataSource, isValidEphem, isValidHorizon } from './loader'
import type {
  CustomSiteResponse,
  EphemFile,
  HorizonFile,
  Meta,
  Site,
  SitesFile,
  TerrainFile,
} from './types'

function makeTestMeta(overrides?: Partial<Meta>): Meta {
  return {
    contract_version: '1.1.1',
    generated_utc: '2026-11-14T00:00:00Z',
    generator: 'test-gen',
    synthetic: false,
    approximate: false,
    inputs: [],
    ...overrides,
  }
}

function makeTestSite(id: string, overrides?: Partial<Site>): Site {
  return {
    id,
    name: `Site ${id}`,
    category: 'apollo',
    mission: 'Apollo',
    agency: 'NASA',
    country: 'USA',
    lat_deg: 0.0,
    lon_deg: 0.0,
    elevation_m: null,
    landing_date_utc: null,
    status: 'landed',
    region_radius_km: null,
    source: { title: 'Test Source', url: 'https://example.com' },
    notes: '',
    ...overrides,
  }
}

function makeTestHorizon(siteId: string, overrides?: Partial<HorizonFile>): HorizonFile {
  return {
    meta: makeTestMeta(),
    site_id: siteId,
    az_step_deg: 0.5,
    n: 720,
    observer_heights_m: [2, 10],
    masks: {
      '2': new Array(720).fill(1.5),
      '10': new Array(720).fill(1.0),
    },
    ...overrides,
  }
}

function makeTestEphem(siteId: string, count = 3, overrides?: Partial<EphemFile>): EphemFile {
  return {
    meta: makeTestMeta(),
    site_id: siteId,
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count,
    sun: {
      az: [10, 20, 30].slice(0, count),
      el: [1, 2, 3].slice(0, count),
    },
    earth: {
      az: [100, 110, 120].slice(0, count),
      el: [40, 45, 50].slice(0, count),
    },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
    ...overrides,
  }
}

function makeTestTerrain(siteId: string): TerrainFile {
  return {
    meta: makeTestMeta(),
    site_id: siteId,
    size_px: 256,
    spacing_m: 80,
    frame: 'local_tangent_enu',
    origin: 'site',
    encoding: 'uint16-le',
    bin: `terrain/${siteId}.bin`,
    height_min_m: -100,
    height_max_m: 100,
    site_height_m: 0,
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function htmlResponse(html = '<!DOCTYPE html><html><body>HTML fallback</body></html>'): Response {
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

describe('loader', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('real vs mock precedence and no-mixing rule', () => {
    it('real files win over mock for the same id when both real horizon and ephem exist', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = {
        meta: makeTestMeta({ generator: 'real-sites' }),
        sites: [site],
      }
      const realH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'real-h', synthetic: false }),
      })
      const realE = makeTestEphem('site_a', 3, {
        meta: makeTestMeta({ generator: 'real-e', synthetic: false }),
      })
      const mockH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'mock-h', synthetic: true }),
      })
      const mockE = makeTestEphem('site_a', 3, {
        meta: makeTestMeta({ generator: 'mock-e', synthetic: true }),
      })

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/site_a.json')) return jsonResponse(realH)
        if (url.endsWith('/data/ephem/site_a.json')) return jsonResponse(realE)
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, baseUrl: '/' })
      const bundle = await ds.loadSite('site_a')

      expect(bundle.provenance).toBe('real')
      expect(bundle.synthetic).toBe(false)
      expect(bundle.horizon.meta.generator).toBe('real-h')
      expect(bundle.ephem.meta.generator).toBe('real-e')
    })

    it('mock pair is used when real horizon is absent', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }
      const realE = makeTestEphem('site_a', 3, { meta: makeTestMeta({ generator: 'real-e' }) })
      const mockH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'mock-h', synthetic: true }),
      })
      const mockE = makeTestEphem('site_a', 3, {
        meta: makeTestMeta({ generator: 'mock-e', synthetic: true }),
      })

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        // Real horizon is 404
        if (url.endsWith('/data/horizon/site_a.json')) return new Response('Not found', { status: 404 })
        // Real ephem exists
        if (url.endsWith('/data/ephem/site_a.json')) return jsonResponse(realE)
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const bundle = await ds.loadSite('site_a')

      expect(bundle.provenance).toBe('mock')
      expect(bundle.synthetic).toBe(true)
      expect(bundle.horizon.meta.generator).toBe('mock-h')
      expect(bundle.ephem.meta.generator).toBe('mock-e')
    })

    it('never mixes a real horizon with a mock ephemeris', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }
      const realH = makeTestHorizon('site_a', { meta: makeTestMeta({ generator: 'real-h' }) })
      const mockH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'mock-h', synthetic: true }),
      })
      const mockE = makeTestEphem('site_a', 3, {
        meta: makeTestMeta({ generator: 'mock-e', synthetic: true }),
      })

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        // Real horizon exists
        if (url.endsWith('/data/horizon/site_a.json')) return jsonResponse(realH)
        // Real ephem is 404
        if (url.endsWith('/data/ephem/site_a.json')) return new Response('Not found', { status: 404 })
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const bundle = await ds.loadSite('site_a')

      expect(bundle.provenance).toBe('mock')
      expect(bundle.synthetic).toBe(true)
      // Must use mock horizon, not real horizon
      expect(bundle.horizon.meta.generator).toBe('mock-h')
      expect(bundle.ephem.meta.generator).toBe('mock-e')
    })

    it('terrain uses real-wins independently of horizon/ephemeris decision and is optional (null when absent)', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }
      // Horizon/ephem real absent -> falls back to mock
      const mockH = makeTestHorizon('site_a', { meta: makeTestMeta({ synthetic: true }) })
      const mockE = makeTestEphem('site_a', 3, { meta: makeTestMeta({ synthetic: true }) })
      // But real terrain is present!
      const realT = makeTestTerrain('site_a')

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/site_a.json')) return new Response('Not found', { status: 404 })
        if (url.endsWith('/data/ephem/site_a.json')) return new Response('Not found', { status: 404 })
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        if (url.endsWith('/data/terrain/site_a.json')) return jsonResponse(realT)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const bundle = await ds.loadSite('site_a')

      expect(bundle.provenance).toBe('mock')
      expect(bundle.terrain).not.toBeNull()
      expect(bundle.terrain?.site_id).toBe('site_a')

      // Case when terrain is absent everywhere
      const fetchImplNoTerrain: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }
      const ds2 = createDataSource({ fetchImpl: fetchImplNoTerrain })
      const bundle2 = await ds2.loadSite('site_a')
      expect(bundle2.terrain).toBeNull()
    })
  })

  describe('Missing-file trap (HTML 200 counts as absent)', () => {
    it('HTML response with status 200 counts as absent and falls back to mock', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }
      const mockH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'mock-h', synthetic: true }),
      })
      const mockE = makeTestEphem('site_a', 3, {
        meta: makeTestMeta({ generator: 'mock-e', synthetic: true }),
      })

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        // Vite dev server returning index.html with 200 for missing real files:
        if (url.endsWith('/data/horizon/site_a.json')) return htmlResponse()
        if (url.endsWith('/data/ephem/site_a.json')) return htmlResponse()
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const bundle = await ds.loadSite('site_a')

      expect(bundle.provenance).toBe('mock')
      expect(bundle.horizon.meta.generator).toBe('mock-h')
      expect(bundle.ephem.meta.generator).toBe('mock-e')
    })

    it('rejects loadSites if both real and mock return HTML 200', async () => {
      const fetchImpl: typeof fetch = async () => htmlResponse()
      const ds = createDataSource({ fetchImpl })
      await expect(ds.loadSites()).rejects.toThrow(/Sites data absent/)
    })
  })

  describe('useMock', () => {
    it('useMock forces mocks and does not fetch real sites', async () => {
      const calls: string[] = []
      const mockSites: SitesFile = {
        meta: makeTestMeta({ generator: 'mock-meta', synthetic: true }),
        sites: [makeTestSite('site_mock')],
      }
      const mockH = makeTestHorizon('site_mock', { meta: makeTestMeta({ synthetic: true }) })
      const mockE = makeTestEphem('site_mock', 3, { meta: makeTestMeta({ synthetic: true }) })

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        calls.push(url)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(mockSites)
        if (url.endsWith('/data/mock/horizon/site_mock.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_mock.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, useMock: true })
      const sites = await ds.loadSites()
      expect(sites.sites[0].id).toBe('site_mock')
      // Real sites.json was never fetched
      expect(calls.some(c => c.endsWith('/data/sites.json'))).toBe(false)

      const bundle = await ds.loadSite('site_mock')
      expect(bundle.provenance).toBe('mock')
      expect(bundle.synthetic).toBe(true)
      // Real horizon / ephem was never fetched
      expect(calls.some(c => c.endsWith('/data/horizon/site_mock.json'))).toBe(false)
    })
  })

  describe('loadSites', () => {
    it('merges by id (real replaces mock with same id, mock-only kept) with real first, and caches promise', async () => {
      let fetchCount = 0
      const realSite1 = makeTestSite('site1', { name: 'Site 1 Real' })
      const realSite2 = makeTestSite('site2', { name: 'Site 2 Real' })
      const mockSite2 = makeTestSite('site2', { name: 'Site 2 Mock' })
      const mockSite3 = makeTestSite('site3', { name: 'Site 3 Mock' })

      const realSitesFile: SitesFile = {
        meta: makeTestMeta({ generator: 'real-generator' }),
        sites: [realSite1, realSite2],
      }
      const mockSitesFile: SitesFile = {
        meta: makeTestMeta({ generator: 'mock-generator' }),
        sites: [mockSite2, mockSite3],
      }

      const fetchImpl: typeof fetch = async (input) => {
        fetchCount++
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(realSitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(mockSitesFile)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const firstCall = await ds.loadSites()

      expect(firstCall.meta.generator).toBe('real-generator')
      expect(firstCall.sites).toHaveLength(3)
      expect(firstCall.sites[0]).toEqual(realSite1)
      expect(firstCall.sites[1]).toEqual(realSite2) // realSite2 replaced mockSite2
      expect(firstCall.sites[2]).toEqual(mockSite3) // mock-only kept

      const initialCount = fetchCount
      const secondCall = await ds.loadSites()
      // Cached promise: returned identical object, fetch count did not grow
      expect(secondCall).toBe(firstCall)
      expect(fetchCount).toBe(initialCount)
    })

    it('rejects with clear Error if both real and mock are absent', async () => {
      const fetchImpl: typeof fetch = async () => new Response('Not found', { status: 404 })
      const ds = createDataSource({ fetchImpl })
      await expect(ds.loadSites()).rejects.toThrow(/Sites data absent/)
    })
  })

  describe('loadSite caching and shape validation', () => {
    it('caches loadSite promise and does not refetch on subsequent calls', async () => {
      let callCount = 0
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }
      const mockH = makeTestHorizon('site_a', { meta: makeTestMeta({ synthetic: true }) })
      const mockE = makeTestEphem('site_a', 3, { meta: makeTestMeta({ synthetic: true }) })

      const fetchImpl: typeof fetch = async (input) => {
        callCount++
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const b1 = await ds.loadSite('site_a')
      const countAfterFirst = callCount
      const b2 = await ds.loadSite('site_a')

      expect(b2).toBe(b1)
      expect(callCount).toBe(countAfterFirst)
    })

    it('rejects for an unknown id and does not cache the failure', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      await expect(ds.loadSite('unknown_site')).rejects.toThrow(/Unknown site/)
      // Should reject again without caching failure as success or corrupted state
      await expect(ds.loadSite('unknown_site')).rejects.toThrow(/Unknown site/)
    })

    it('shape validation failure on real pair falls back to mock pair', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }

      // Real horizon has wrong mask length (10 instead of 720)
      const corruptedRealH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'corrupted-real' }),
        masks: { '2': new Array(10).fill(1.5) },
      })
      const realE = makeTestEphem('site_a', 3)

      const mockH = makeTestHorizon('site_a', {
        meta: makeTestMeta({ generator: 'valid-mock-h', synthetic: true }),
      })
      const mockE = makeTestEphem('site_a', 3, {
        meta: makeTestMeta({ generator: 'valid-mock-e', synthetic: true }),
      })

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/site_a.json')) return jsonResponse(corruptedRealH)
        if (url.endsWith('/data/ephem/site_a.json')) return jsonResponse(realE)
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(mockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      const bundle = await ds.loadSite('site_a')

      expect(bundle.provenance).toBe('mock')
      expect(bundle.horizon.meta.generator).toBe('valid-mock-h')
      expect(bundle.ephem.meta.generator).toBe('valid-mock-e')
    })

    it('shape validation failure on mock pair rejects', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }

      // Mock ephem has count mismatch (sun.az length 2 vs count 3)
      const corruptedMockE = makeTestEphem('site_a', 3, {
        sun: { az: [1, 2], el: [1, 2, 3] },
      })
      const mockH = makeTestHorizon('site_a')

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/horizon/site_a.json')) return jsonResponse(mockH)
        if (url.endsWith('/data/mock/ephem/site_a.json')) return jsonResponse(corruptedMockE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      await expect(ds.loadSite('site_a')).rejects.toThrow(/Data absent or invalid/)
    })

    it('delegates to loadCustomSite when siteId is a custom site id', async () => {
      const curatedSite = makeTestSite('curated_base', {
        lat_deg: -89.0,
        lon_deg: 0.0,
        category: 'apollo',
      })
      const curatedH = makeTestHorizon('curated_base')
      const curatedE = makeTestEphem('curated_base', 3)
      const sitesFile: SitesFile = {
        meta: makeTestMeta(),
        sites: [curatedSite],
      }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/curated_base.json')) return jsonResponse(curatedH)
        if (url.endsWith('/data/ephem/curated_base.json')) return jsonResponse(curatedE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: null })
      const bundle1 = await ds.loadSite('custom_-89p500_45p000')

      expect(bundle1.site.id).toBe('custom_-89p500_45p000')
      expect(bundle1.site.category).toBe('custom')
      expect(bundle1.site.lat_deg).toBe(-89.5)
      expect(bundle1.site.lon_deg).toBe(45)
      expect(bundle1.approximate).toBe(true)

      // Subsequent call returns cached promise
      const bundle2 = await ds.loadSite('custom_-89p500_45p000')
      expect(bundle2).toBe(bundle1)
    })

    it('rejects malformed custom site id as unknown site', async () => {
      const site = makeTestSite('site_a')
      const sitesFile: SitesFile = { meta: makeTestMeta(), sites: [site] }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl })
      await expect(ds.loadSite('custom_invalid_format')).rejects.toThrow(/Unknown site/)
      await expect(ds.loadSite('custom_95p000_0p000')).rejects.toThrow(/Unknown site/)
    })
  })

  describe('loadCustomSite', () => {
    const curatedSite = makeTestSite('curated_1', {
      lat_deg: -89.0,
      lon_deg: 0.0,
      category: 'apollo',
    })
    const curatedH = makeTestHorizon('curated_1')
    const curatedE = makeTestEphem('curated_1', 3)
    const sitesFile: SitesFile = {
      meta: makeTestMeta(),
      sites: [curatedSite],
    }

    it('rejects invalid coordinates', async () => {
      const ds = createDataSource({ fetchImpl: async () => new Response('Not found', { status: 404 }) })

      await expect(ds.loadCustomSite(91, 0)).rejects.toThrow(/Invalid coordinates/)
      await expect(ds.loadCustomSite(-90.1, 0)).rejects.toThrow(/Invalid coordinates/)
      await expect(ds.loadCustomSite(0, 180.1)).rejects.toThrow(/Invalid coordinates/)
      await expect(ds.loadCustomSite(0, -180.1)).rejects.toThrow(/Invalid coordinates/)
      await expect(ds.loadCustomSite(NaN, 0)).rejects.toThrow(/Invalid coordinates/)
      await expect(ds.loadCustomSite(0, Infinity)).rejects.toThrow(/Invalid coordinates/)
    })

    it('formats custom site id correctly', async () => {
      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/curated_1.json')) return jsonResponse(curatedH)
        if (url.endsWith('/data/ephem/curated_1.json')) return jsonResponse(curatedE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: null })
      const bundle = await ds.loadCustomSite(-89.5, 45)
      expect(bundle.site.id).toBe('custom_-89p500_45p000')
    })

    it('uses API response when valid (provenance custom_api)', async () => {
      const apiResponse: CustomSiteResponse = {
        site: {
          id: 'custom_-89p500_45p000',
          category: 'custom',
          lat_deg: -89.5,
          lon_deg: 45.0,
          name: 'Custom site from API',
        },
        horizon: makeTestHorizon('custom_-89p500_45p000'),
        ephem: makeTestEphem('custom_-89p500_45p000', 3),
      }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.includes('/api/custom-site')) {
          expect(url).toContain('lat=-89.5')
          expect(url).toContain('lon=45')
          return jsonResponse(apiResponse)
        }
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({
        fetchImpl,
        apiUrl: 'https://api.example.com/',
        useMock: false,
      })

      const bundle = await ds.loadCustomSite(-89.5, 45)
      expect(bundle.provenance).toBe('custom_api')
      expect(bundle.site.name).toBe('Custom site from API')
      expect(bundle.site.category).toBe('custom')
      expect(bundle.site.status).toBe('planned')
      expect(bundle.terrain).toBeNull()
    })

    it('falls back to approximation on API 500 error', async () => {
      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.includes('/api/custom-site')) {
          return new Response('Server Error', { status: 500 })
        }
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/curated_1.json')) return jsonResponse(curatedH)
        if (url.endsWith('/data/ephem/curated_1.json')) return jsonResponse(curatedE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: 'https://api.example.com' })
      const bundle = await ds.loadCustomSite(-89.5, 45)

      expect(bundle.provenance).toBe('custom_approx')
      expect(bundle.site.id).toBe('custom_-89p500_45p000')
      expect(bundle.approximate).toBe(true)
    })

    it('falls back to approximation on API bad JSON / shape validation failure', async () => {
      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.includes('/api/custom-site')) {
          return new Response('invalid json', { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.endsWith('/data/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(sitesFile)
        if (url.endsWith('/data/horizon/curated_1.json')) return jsonResponse(curatedH)
        if (url.endsWith('/data/ephem/curated_1.json')) return jsonResponse(curatedE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: 'https://api.example.com' })
      const bundle = await ds.loadCustomSite(-89.5, 45)

      expect(bundle.provenance).toBe('custom_approx')
    })

    it('falls back to approximation on API timeout (using fake timers)', async () => {
      vi.useFakeTimers()

      const fetchImpl: typeof fetch = (input, init) => {
        const url = String(input)
        if (url.includes('/api/custom-site')) {
          // Never resolves until aborted
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted by timeout', 'AbortError'))
            })
          })
        }
        if (url.endsWith('/data/sites.json')) return Promise.resolve(jsonResponse(sitesFile))
        if (url.endsWith('/data/mock/sites.json')) return Promise.resolve(jsonResponse(sitesFile))
        if (url.endsWith('/data/horizon/curated_1.json')) return Promise.resolve(jsonResponse(curatedH))
        if (url.endsWith('/data/ephem/curated_1.json')) return Promise.resolve(jsonResponse(curatedE))
        return Promise.resolve(new Response('Not found', { status: 404 }))
      }

      const ds = createDataSource({
        fetchImpl,
        apiUrl: 'https://api.example.com',
        apiTimeoutMs: 100,
      })

      const customPromise = ds.loadCustomSite(-89.5, 45)
      // Advance fake timers beyond apiTimeoutMs
      await vi.advanceTimersByTimeAsync(150)

      const bundle = await customPromise
      expect(bundle.provenance).toBe('custom_approx')
      expect(bundle.site.id).toBe('custom_-89p500_45p000')
    })

    it('caches custom bundles by id', async () => {
      let apiCallCount = 0
      const apiResponse: CustomSiteResponse = {
        site: {
          id: 'custom_0p000_0p000',
          category: 'custom',
          lat_deg: 0,
          lon_deg: 0,
        },
        horizon: makeTestHorizon('custom_0p000_0p000'),
        ephem: makeTestEphem('custom_0p000_0p000', 3),
      }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.includes('/api/custom-site')) {
          apiCallCount++
          return jsonResponse(apiResponse)
        }
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: 'https://api.example.com' })
      const b1 = await ds.loadCustomSite(0, 0)
      const b2 = await ds.loadCustomSite(0, 0)

      expect(b1).toBe(b2)
      expect(apiCallCount).toBe(1)
    })

    it('nearest curated site selection ignores custom category sites', async () => {
      const distantCurated = makeTestSite('curated_distant', {
        lat_deg: 10,
        lon_deg: 0,
        category: 'apollo',
      })
      const closeCustom = makeTestSite('custom_close', {
        lat_deg: 0.1,
        lon_deg: 0.1,
        category: 'custom',
      })
      const distantH = makeTestHorizon('curated_distant')
      const distantE = makeTestEphem('curated_distant', 3)

      const multiSitesFile: SitesFile = {
        meta: makeTestMeta(),
        sites: [distantCurated, closeCustom],
      }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.endsWith('/data/sites.json')) return jsonResponse(multiSitesFile)
        if (url.endsWith('/data/mock/sites.json')) return jsonResponse(multiSitesFile)
        if (url.endsWith('/data/horizon/curated_distant.json')) return jsonResponse(distantH)
        if (url.endsWith('/data/ephem/curated_distant.json')) return jsonResponse(distantE)
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: null })
      const bundle = await ds.loadCustomSite(0, 0)

      // Reference must be curated_distant, ignoring closeCustom because category is 'custom'
      expect(bundle.site.notes).toContain('curated_distant')
    })

    it('custom API response merges only whitelisted fields and ignores source.url and non-whitelisted fields', async () => {
      const maliciousApiResponse = {
        site: {
          id: 'hacked_id',
          name: 'Whitelisted Name',
          category: 'apollo',
          status: 'crashed',
          lat_deg: -85.5,
          lon_deg: 25.0,
          elevation_m: 1234,
          notes: 'Whitelisted notes',
          source: {
            title: 'Hacked Title',
            url: 'javascript:alert(1)',
          },
          evilField: 'should_be_ignored',
        },
        horizon: makeTestHorizon('custom_-85p500_25p000'),
        ephem: makeTestEphem('custom_-85p500_25p000', 3),
      }

      const fetchImpl: typeof fetch = async (input) => {
        const url = String(input)
        if (url.includes('/api/custom-site')) {
          return jsonResponse(maliciousApiResponse)
        }
        return new Response('Not found', { status: 404 })
      }

      const ds = createDataSource({ fetchImpl, apiUrl: 'https://api.example.com' })
      const bundle = await ds.loadCustomSite(-85.5, 25.0)

      // Whitelisted fields merged
      expect(bundle.site.name).toBe('Whitelisted Name')
      expect(bundle.site.lat_deg).toBe(-85.5)
      expect(bundle.site.lon_deg).toBe(25.0)
      expect(bundle.site.elevation_m).toBe(1234)
      expect(bundle.site.notes).toBe('Whitelisted notes')

      // Non-whitelisted fields preserved from defaultSite
      expect(bundle.site.id).toBe('custom_-85p500_25p000') // not 'hacked_id'
      expect(bundle.site.category).toBe('custom') // not 'apollo'
      expect(bundle.site.status).toBe('planned') // not 'crashed'
      expect(bundle.site.source.url).toBe('') // source.url is NEVER taken from API
      expect((bundle.site as unknown as Record<string, unknown>).evilField).toBeUndefined()
    })
  })

  describe('isValidHorizon validation hardening (Item 11)', () => {
    it('accepts valid horizon', () => {
      expect(isValidHorizon(makeTestHorizon('test'))).toBe(true)
    })

    it('rejects non-object or null', () => {
      expect(isValidHorizon(null)).toBe(false)
      expect(isValidHorizon(undefined)).toBe(false)
      expect(isValidHorizon('horizon')).toBe(false)
    })

    it('rejects non-integer n, n < 1, or n > 10000', () => {
      expect(isValidHorizon(makeTestHorizon('test', { n: 0 }))).toBe(false)
      expect(isValidHorizon(makeTestHorizon('test', { n: -5 }))).toBe(false)
      expect(isValidHorizon(makeTestHorizon('test', { n: 1.5 }))).toBe(false)
      expect(isValidHorizon(makeTestHorizon('test', { n: 10001 }))).toBe(false)
    })

    it('rejects non-positive or non-finite az_step_deg', () => {
      expect(isValidHorizon(makeTestHorizon('test', { az_step_deg: 0 }))).toBe(false)
      expect(isValidHorizon(makeTestHorizon('test', { az_step_deg: -1 }))).toBe(false)
      expect(isValidHorizon(makeTestHorizon('test', { az_step_deg: NaN }))).toBe(false)
      expect(isValidHorizon(makeTestHorizon('test', { az_step_deg: Infinity }))).toBe(false)
    })

    it('rejects non-digit mask keys like __proto__ or letters', () => {
      const h1 = makeTestHorizon('test')
      h1.masks = { __proto__: new Array(720).fill(1) } as unknown as Record<string, number[]>
      expect(isValidHorizon(h1)).toBe(false)

      const h2 = makeTestHorizon('test')
      h2.masks = { height_2: new Array(720).fill(1) }
      expect(isValidHorizon(h2)).toBe(false)
    })

    it('rejects masks with wrong length or non-finite numbers', () => {
      const hWrongLen = makeTestHorizon('test')
      hWrongLen.masks = { '2': [1, 2] } // n is 720
      expect(isValidHorizon(hWrongLen)).toBe(false)

      const hNonFinite = makeTestHorizon('test')
      const arr = new Array(720).fill(1)
      arr[10] = NaN
      hNonFinite.masks = { '2': arr }
      expect(isValidHorizon(hNonFinite)).toBe(false)
    })
  })

  describe('isValidEphem validation hardening (Item 11)', () => {
    it('accepts valid ephem', () => {
      expect(isValidEphem(makeTestEphem('test', 3))).toBe(true)
    })

    it('rejects non-object or null', () => {
      expect(isValidEphem(null)).toBe(false)
      expect(isValidEphem(undefined)).toBe(false)
      expect(isValidEphem(123)).toBe(false)
    })

    it('rejects non-integer count, count < 1, or count > 50000', () => {
      expect(isValidEphem(makeTestEphem('test', 0))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', -1))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', 2.5 as unknown as number))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', 50001))).toBe(false)
    })

    it('rejects non-positive or non-finite step_minutes', () => {
      expect(isValidEphem(makeTestEphem('test', 3, { step_minutes: 0 }))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', 3, { step_minutes: -10 }))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', 3, { step_minutes: NaN }))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', 3, { step_minutes: Infinity }))).toBe(false)
    })

    it('rejects unparseable start_utc', () => {
      expect(isValidEphem(makeTestEphem('test', 3, { start_utc: 'invalid-date' }))).toBe(false)
      expect(isValidEphem(makeTestEphem('test', 3, { start_utc: '' }))).toBe(false)
    })

    it('rejects non-finite values or length mismatch in track arrays', () => {
      const ephemBadLen = makeTestEphem('test', 3)
      ephemBadLen.sun.az = [0, 0] // length 2 instead of 3
      expect(isValidEphem(ephemBadLen)).toBe(false)

      const ephemNaN = makeTestEphem('test', 3)
      ephemNaN.earth.el = [0, NaN, 0]
      expect(isValidEphem(ephemNaN)).toBe(false)
    })
  })
})
