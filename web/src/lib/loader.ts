import type {
  CustomSiteResponse,
  EphemFile,
  HorizonFile,
  Site,
  SiteBundle,
  SiteDataSource,
  SitesFile,
  TerrainFile,
} from './types'
import {
  approximateCustomSite,
  customSiteId,
  parseCustomSiteId,
} from './customSite'

export interface LoaderOptions {
  fetchImpl?: typeof fetch // default: globalThis.fetch
  baseUrl?: string // default: import.meta.env.BASE_URL
  useMock?: boolean // default: import.meta.env.VITE_USE_MOCK === '1'
  apiUrl?: string | null // default: import.meta.env.VITE_API_URL ?? null
  apiTimeoutMs?: number // default: 4000
}

function resolveUrl(baseUrl: string, relPath: string): string {
  const cleanRel = relPath.replace(/^\/+/, '')
  if (!baseUrl) return cleanRel
  return baseUrl.endsWith('/') ? `${baseUrl}${cleanRel}` : `${baseUrl}/${cleanRel}`
}

export function isValidHorizon(h: unknown): h is HorizonFile {
  if (!h || typeof h !== 'object') return false
  const horizon = h as HorizonFile
  if (!Number.isInteger(horizon.n) || horizon.n < 1 || horizon.n > 10000) return false
  if (
    typeof horizon.az_step_deg !== 'number' ||
    !Number.isFinite(horizon.az_step_deg) ||
    horizon.az_step_deg <= 0
  ) {
    return false
  }
  if (!horizon.masks || typeof horizon.masks !== 'object' || Array.isArray(horizon.masks)) {
    return false
  }
  const maskKeys = Object.keys(horizon.masks)
  if (maskKeys.length === 0) return false
  for (const k of maskKeys) {
    if (!/^\d+$/.test(k)) return false
    const mask = horizon.masks[k]
    if (!Array.isArray(mask) || mask.length !== horizon.n) {
      return false
    }
    for (let i = 0; i < mask.length; i++) {
      if (typeof mask[i] !== 'number' || !Number.isFinite(mask[i])) {
        return false
      }
    }
  }
  return true
}

export function isValidTerrain(t: unknown): t is TerrainFile {
  if (!t || typeof t !== 'object') return false
  const terrain = t as TerrainFile
  if (!Number.isInteger(terrain.size_px) || terrain.size_px < 2 || terrain.size_px > 4096) return false
  for (const v of [terrain.spacing_m, terrain.height_min_m, terrain.height_max_m, terrain.site_height_m]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return false
  }
  if (terrain.spacing_m <= 0 || terrain.height_max_m < terrain.height_min_m) return false
  if (terrain.frame !== 'local_tangent_enu' || terrain.encoding !== 'uint16-le') return false
  return typeof terrain.bin === 'string' && terrain.bin.length > 0 && Boolean(terrain.meta)
}

export function isValidEphem(e: unknown): e is EphemFile {
  if (!e || typeof e !== 'object') return false
  const ephem = e as EphemFile
  if (!Number.isInteger(ephem.count) || ephem.count < 1 || ephem.count > 50000) return false
  if (
    typeof ephem.step_minutes !== 'number' ||
    !Number.isFinite(ephem.step_minutes) ||
    ephem.step_minutes <= 0
  ) {
    return false
  }
  if (typeof ephem.start_utc !== 'string' || !Number.isFinite(Date.parse(ephem.start_utc))) {
    return false
  }
  if (!ephem.sun || !ephem.earth) return false

  const tracks = [ephem.sun.az, ephem.sun.el, ephem.earth.az, ephem.earth.el]
  for (const arr of tracks) {
    if (!Array.isArray(arr) || arr.length !== ephem.count) return false
    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'number' || !Number.isFinite(arr[i])) return false
    }
  }
  return true
}

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const res = await fetchImpl(url, init)
    if (!res || !res.ok) {
      return null
    }
    const ct = res.headers?.get?.('content-type')
    if (ct && ct.toLowerCase().includes('text/html')) {
      return null
    }
    const text =
      typeof res.text === 'function'
        ? await res.text()
        : JSON.stringify(await res.json())
    if (!text || !text.trim() || text.trim().startsWith('<')) {
      return null
    }
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object') {
      return null
    }
    return data as T
  } catch {
    return null
  }
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const phi1 = lat1 * (Math.PI / 180)
  const phi2 = lat2 * (Math.PI / 180)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const clampedA = Math.max(0, Math.min(1, a))
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA))
  return 1737.4 * c
}

export function createDataSource(opts?: LoaderOptions): SiteDataSource {
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const baseUrl = opts?.baseUrl ?? import.meta.env?.BASE_URL ?? '/'
  const useMock = opts?.useMock ?? (import.meta.env?.VITE_USE_MOCK === '1')
  const apiUrl =
    opts?.apiUrl !== undefined
      ? opts.apiUrl
      : (import.meta.env?.VITE_API_URL ?? null)
  const apiTimeoutMs = opts?.apiTimeoutMs ?? 4000

  let sitesPromise: Promise<SitesFile> | null = null
  const siteCache = new Map<string, Promise<SiteBundle>>()
  const customCache = new Map<string, Promise<SiteBundle>>()

  function loadSites(): Promise<SitesFile> {
    if (sitesPromise) {
      return sitesPromise
    }

    sitesPromise = (async () => {
      let realSitesFile: SitesFile | null = null
      let mockSitesFile: SitesFile | null = null

      if (useMock) {
        mockSitesFile = await fetchJson<SitesFile>(
          fetchImpl,
          resolveUrl(baseUrl, 'data/mock/sites.json'),
        )
      } else {
        const [r, m] = await Promise.all([
          fetchJson<SitesFile>(fetchImpl, resolveUrl(baseUrl, 'data/sites.json')),
          fetchJson<SitesFile>(fetchImpl, resolveUrl(baseUrl, 'data/mock/sites.json')),
        ])
        realSitesFile = r
        mockSitesFile = m
      }

      if (realSitesFile && !Array.isArray(realSitesFile.sites)) {
        realSitesFile = null
      }
      if (mockSitesFile && !Array.isArray(mockSitesFile.sites)) {
        mockSitesFile = null
      }

      if (!realSitesFile && !mockSitesFile) {
        throw new Error('Sites data absent: neither real nor mock sites.json found')
      }

      if (realSitesFile && !mockSitesFile) {
        return realSitesFile
      }

      if (!realSitesFile && mockSitesFile) {
        return mockSitesFile
      }

      // Both real and mock exist: merge by id
      const realSites = realSitesFile!.sites
      const mockSites = mockSitesFile!.sites
      const realIds = new Set(realSites.map(s => s.id))
      const mergedSites = [...realSites]

      for (const site of mockSites) {
        if (!realIds.has(site.id)) {
          mergedSites.push(site)
        }
      }

      return {
        meta: realSitesFile!.meta ?? mockSitesFile!.meta,
        sites: mergedSites,
      }
    })().catch(err => {
      sitesPromise = null
      throw err
    })

    return sitesPromise
  }

  function loadSite(siteId: string): Promise<SiteBundle> {
    const customCoords = parseCustomSiteId(siteId)
    if (customCoords) {
      return loadCustomSite(customCoords.lat, customCoords.lon)
    }

    const cached = siteCache.get(siteId)
    if (cached) {
      return cached
    }

    const p = (async () => {
      const sitesFile = await loadSites()
      const site = sitesFile.sites.find(s => s.id === siteId)
      if (!site) {
        throw new Error(`Unknown site: ${siteId}`)
      }

      let horizon: HorizonFile | null = null
      let ephem: EphemFile | null = null
      let provenance: SiteBundle['provenance'] = 'real'

      if (!useMock) {
        const [rH, rE] = await Promise.all([
          fetchJson<HorizonFile>(
            fetchImpl,
            resolveUrl(baseUrl, `data/horizon/${siteId}.json`),
          ),
          fetchJson<EphemFile>(
            fetchImpl,
            resolveUrl(baseUrl, `data/ephem/${siteId}.json`),
          ),
        ])
        if (rH && rE && isValidHorizon(rH) && isValidEphem(rE)) {
          horizon = rH
          ephem = rE
          provenance = 'real'
        }
      }

      if (!horizon || !ephem) {
        const [mH, mE] = await Promise.all([
          fetchJson<HorizonFile>(
            fetchImpl,
            resolveUrl(baseUrl, `data/mock/horizon/${siteId}.json`),
          ),
          fetchJson<EphemFile>(
            fetchImpl,
            resolveUrl(baseUrl, `data/mock/ephem/${siteId}.json`),
          ),
        ])
        if (!mH || !mE || !isValidHorizon(mH) || !isValidEphem(mE)) {
          throw new Error(`Data absent or invalid for site: ${siteId}`)
        }
        horizon = mH
        ephem = mE
        provenance = 'mock'
      }

      let terrain: TerrainFile | null = null
      if (!useMock) {
        terrain = await fetchJson<TerrainFile>(
          fetchImpl,
          resolveUrl(baseUrl, `data/terrain/${siteId}.json`),
        )
        if (!isValidTerrain(terrain)) terrain = null
      }
      if (!terrain) {
        terrain = await fetchJson<TerrainFile>(
          fetchImpl,
          resolveUrl(baseUrl, `data/mock/terrain/${siteId}.json`),
        )
        if (!isValidTerrain(terrain)) terrain = null
      }

      const files = terrain ? [horizon, ephem, terrain] : [horizon, ephem]
      const synthetic = files.some(f => Boolean(f.meta?.synthetic))
      const approximate = files.some(f => Boolean(f.meta?.approximate))

      return {
        site,
        horizon,
        ephem,
        terrain,
        provenance,
        synthetic,
        approximate,
      }
    })().catch(err => {
      siteCache.delete(siteId)
      throw err
    })

    siteCache.set(siteId, p)
    return p
  }

  function loadCustomSite(lat: number, lon: number): Promise<SiteBundle> {
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return Promise.reject(
        new Error(`Invalid coordinates: lat=${lat}, lon=${lon}`),
      )
    }

    const id = customSiteId(lat, lon)
    const cached = customCache.get(id)
    if (cached) {
      return cached
    }

    const p = (async () => {
      if (apiUrl && !useMock) {
        try {
          const cleanApi = apiUrl.replace(/\/+$/, '')
          const query = `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
          const url = `${cleanApi}/api/custom-site?${query}`

          const controller = new AbortController()
          const timer = setTimeout(() => {
            controller.abort()
          }, apiTimeoutMs)

          try {
            const res = await fetchImpl(url, { signal: controller.signal })
            if (!res.ok) {
              throw new Error(`API HTTP ${res.status}`)
            }
            const ct = res.headers?.get?.('content-type')
            if (ct && ct.toLowerCase().includes('text/html')) {
              throw new Error('API returned HTML')
            }
            const text =
              typeof res.text === 'function'
                ? await res.text()
                : JSON.stringify(await res.json())
            if (!text || text.trim().startsWith('<')) {
              throw new Error('API returned empty or HTML text')
            }
            const data = JSON.parse(text) as CustomSiteResponse
            if (
              !data ||
              typeof data !== 'object' ||
              !data.site ||
              typeof data.site !== 'object' ||
              !isValidHorizon(data.horizon) ||
              !isValidEphem(data.ephem)
            ) {
              throw new Error('API response failed shape validation')
            }

            const defaultSite: Site = {
              id,
              name: 'Custom site',
              category: 'custom',
              mission: null,
              agency: null,
              country: null,
              elevation_m: null,
              landing_date_utc: null,
              region_radius_km: null,
              lat_deg: lat,
              lon_deg: lon,
              status: 'planned',
              source: {
                title: 'User-entered coordinates',
                url: '',
              },
              notes: '',
            }

            const rawApiSite =
              data.site && typeof data.site === 'object'
                ? (data.site as Record<string, unknown>)
                : {}

            const site: Site = {
              ...defaultSite,
              name:
                typeof rawApiSite.name === 'string' && rawApiSite.name.trim()
                  ? rawApiSite.name
                  : defaultSite.name,
              lat_deg:
                typeof rawApiSite.lat_deg === 'number' && Number.isFinite(rawApiSite.lat_deg)
                  ? rawApiSite.lat_deg
                  : defaultSite.lat_deg,
              lon_deg:
                typeof rawApiSite.lon_deg === 'number' && Number.isFinite(rawApiSite.lon_deg)
                  ? rawApiSite.lon_deg
                  : defaultSite.lon_deg,
              elevation_m:
                typeof rawApiSite.elevation_m === 'number' && Number.isFinite(rawApiSite.elevation_m)
                  ? rawApiSite.elevation_m
                  : defaultSite.elevation_m,
              notes:
                typeof rawApiSite.notes === 'string'
                  ? rawApiSite.notes
                  : defaultSite.notes,
              source: {
                title: defaultSite.source.title,
                url: '',
              },
            }

            const synthetic = Boolean(
              data.horizon.meta?.synthetic || data.ephem.meta?.synthetic,
            )
            const approximate = Boolean(
              data.horizon.meta?.approximate || data.ephem.meta?.approximate,
            )

            return {
              site,
              horizon: data.horizon,
              ephem: data.ephem,
              terrain: null,
              provenance: 'custom_api' as const,
              synthetic,
              approximate,
            }
          } finally {
            clearTimeout(timer)
          }
        } catch {
          // Fall back to approximation
        }
      }

      // Fallback: approximateCustomSite(lat, lon, reference)
      const sitesFile = await loadSites()
      const curated = sitesFile.sites.filter(s => s.category !== 'custom')
      if (curated.length === 0) {
        throw new Error('No curated sites available to approximate custom site')
      }

      let nearest = curated[0]
      let minDist = Infinity
      for (const s of curated) {
        const d = haversineDistance(lat, lon, s.lat_deg, s.lon_deg)
        if (d < minDist) {
          minDist = d
          nearest = s
        }
      }

      const reference = await loadSite(nearest.id)
      return approximateCustomSite(lat, lon, reference)
    })().catch(err => {
      customCache.delete(id)
      throw err
    })

    customCache.set(id, p)
    return p
  }

  return {
    loadSites,
    loadSite,
    loadCustomSite,
  }
}

export const dataSource: SiteDataSource = createDataSource()
