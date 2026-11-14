// Data shapes of docs/contract.md (contract_version 1.1.1), section 2, plus the
// bundle and loader interfaces scope B uses internally.
// Shared types: change only via the lead.

export type SiteCategory =
  | 'apollo'
  | 'clps'
  | 'commercial'
  | 'international'
  | 'artemis_region'
  | 'custom'

export type SiteStatus = 'landed' | 'crashed' | 'planned' | 'candidate_region'

export type ObserverHeightM = 2 | 10

export interface MetaInput {
  name: string
  url: string
  notes?: string
}

/** Top-level `meta` object present in every contract JSON file (contract §1). */
export interface Meta {
  contract_version: string
  generated_utc: string
  generator: string
  synthetic: boolean
  approximate: boolean
  inputs: MetaInput[]
}

export interface SiteSource {
  title: string
  url: string
}

export interface Site {
  id: string
  name: string
  category: SiteCategory
  mission: string | null
  agency: string | null
  country: string | null
  lat_deg: number
  lon_deg: number
  elevation_m: number | null
  landing_date_utc: string | null
  status: SiteStatus
  region_radius_km: number | null
  source: SiteSource
  notes: string
}

export interface SitesFile {
  meta: Meta
  sites: Site[]
}

/** `horizon/<site_id>.json` (§2.2). `masks` is keyed by observer height in metres, as a string. */
export interface HorizonFile {
  meta: Meta
  site_id: string
  az_step_deg: number
  n: number
  observer_heights_m: number[]
  masks: Record<string, number[]>
  dem?: {
    product: string
    resolution_m: number
    url: string
    max_range_km: number
  }
  uncertainty_deg?: number
}

export interface BodyTrack {
  az: number[]
  el: number[]
}

/** `ephem/<site_id>.json` (§2.3). Sample k is at start_utc + k * step_minutes. */
export interface EphemFile {
  meta: Meta
  site_id: string
  start_utc: string
  step_minutes: number
  count: number
  sun: BodyTrack
  earth: BodyTrack
  sun_ang_radius_deg: number
  earth_ang_radius_deg: number
  horizons_query?: Record<string, string>
}

/** `terrain/<site_id>.json` (§2.5); the heights live in the sibling `.bin` (uint16-le). */
export interface TerrainFile {
  meta: Meta
  site_id: string
  size_px: number
  spacing_m: number
  frame: 'local_tangent_enu'
  origin: 'site'
  encoding: 'uint16-le'
  bin: string
  height_min_m: number
  height_max_m: number
  site_height_m: number
  dem?: { product: string; resolution_m: number; url: string }
}

/** Where a loaded bundle came from. Drives the synthetic / approximate badges. */
export type Provenance = 'real' | 'mock' | 'custom_api' | 'custom_approx'

/** Everything the UI needs to show one site. */
export interface SiteBundle {
  site: Site
  horizon: HorizonFile
  ephem: EphemFile
  terrain: TerrainFile | null
  provenance: Provenance
  /** True when any contract file of this bundle has meta.synthetic = true. */
  synthetic: boolean
  /** True when any contract file of this bundle has meta.approximate = true. */
  approximate: boolean
}

/** Response of the optional `api/` service: `GET /api/custom-site?lat=&lon=`. Payloads follow the contract. */
export interface CustomSiteResponse {
  site: Pick<Site, 'id' | 'category' | 'lat_deg' | 'lon_deg'> & Partial<Site>
  horizon: HorizonFile
  ephem: EphemFile
}

/** Window finder rules, contract §3. */
export interface MissionRules {
  observerHeightM: 2 | 10
  missionDurationH: number
  minPctSunlit: number
  maxLongestDarkH: number
  earthAtLandingRequired: boolean
  minPctEarth: number
  minSunElAtLandingDeg?: number
}

/** Contiguous valid landing window found by the window finder. */
export interface LandingWindow {
  start_utc: string
  end_utc: string
}

/** Why a transition time is missing (contract §3). */
export type TransitionGap = 'beyond_data'

/**
 * Metrics of contract §3 over one interval. Field names follow the contract table;
 * the exact shape of the transition fields is aligned with validation/fixtures/metrics_cases.json
 * once scope A delivers it.
 */
export interface ScenarioMetrics {
  sun_el_deg: number
  sun_clearance_deg: number
  pct_sunlit: number
  mean_sun_frac: number
  longest_dark_h: number
  pct_earth: number
  longest_no_earth_h: number
  pct_both: number
  next_sunset_utc: string | null
  next_sunrise_utc: string | null
  next_earthset_utc: string | null
  next_earthrise_utc: string | null
  time_to_sunset_h: number | null
  time_to_earthset_h: number | null
  /** Reason when the matching transition is null. */
  gaps: Partial<
    Record<
      'sunset' | 'sunrise' | 'earthset' | 'earthrise',
      TransitionGap
    >
  >
}

/**
 * Loader contract (implemented in lib/ by ui-core). Per-site files are loaded lazily and cached.
 * Real files win over mocks per site; VITE_USE_MOCK=1 forces mocks.
 */
export interface SiteDataSource {
  loadSites(): Promise<SitesFile>
  loadSite(siteId: string): Promise<SiteBundle>
  /**
   * Custom lat/lon. Tries `${VITE_API_URL}/api/custom-site` with a 4 s timeout, then falls back to the
   * client-side approximation (smooth-sphere horizon, ephemeris derived from the nearest loaded site,
   * meta.approximate = true, provenance 'custom_approx').
   */
  loadCustomSite(lat: number, lon: number): Promise<SiteBundle>
}
