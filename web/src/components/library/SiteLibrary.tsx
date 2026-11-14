import { useEffect, useMemo, useState, type FC } from 'react'
import { MAX_SCENARIOS } from '../../config/dataRange'
import { dataSource } from '../../lib/loader'
import type { Site, SiteCategory } from '../../lib/types'
import { useAppStore } from '../../state/store'
import { formatCoordDisplay } from '../map/coords'
import { safeHttpsUrl } from './safeUrl'
import './library.css'

export interface SiteLibraryProps {
  sites?: Site[]
  className?: string
}

const CATEGORY_ORDER: SiteCategory[] = [
  'apollo',
  'clps',
  'commercial',
  'international',
  'artemis_region',
  'custom',
]

const CATEGORY_TITLES: Record<SiteCategory, string> = {
  apollo: 'Apollo',
  clps: 'Commercial Lunar Payload Services (CLPS)',
  commercial: 'Commercial',
  international: 'International',
  artemis_region: 'Artemis Candidate Regions',
  custom: 'Custom Sites',
}

function formatStatus(status: Site['status']): string {
  switch (status) {
    case 'landed':
      return 'Landed'
    case 'crashed':
      return 'Crashed'
    case 'planned':
      return 'Planned'
    case 'candidate_region':
      return 'Candidate region'
    default:
      return status
  }
}

function formatLandingDate(dateUtc: string | null): string | null {
  if (!dateUtc) return null
  // Format as readable UTC date YYYY-MM-DD
  return dateUtc.length >= 10 ? dateUtc.slice(0, 10) : dateUtc
}

export const SiteLibrary: FC<SiteLibraryProps> = ({
  sites: propSites,
  className,
}) => {
  const scenarios = useAppStore((s) => s.scenarios)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const updateScenario = useAppStore((s) => s.updateScenario)
  const addScenario = useAppStore((s) => s.addScenario)

  const [loadedSites, setLoadedSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(!propSites)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Load sites if not passed as prop
  useEffect(() => {
    if (propSites) return

    let cancelled = false
    dataSource.loadSites().then(
      (file) => {
        if (cancelled) return
        setLoadedSites(file.sites)
        setLoading(false)
      },
      (err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [propSites])

  const allSites = propSites ?? loadedSites

  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0]
  const activeSiteId = activeScenario?.siteId ?? null

  // Filter sites by query (name, mission, agency, country)
  const query = searchQuery.trim().toLowerCase()
  const filteredSites = useMemo(() => {
    if (!query) return allSites
    return allSites.filter((site) => {
      const matchName = site.name.toLowerCase().includes(query)
      const matchMission = site.mission?.toLowerCase().includes(query) ?? false
      const matchAgency = site.agency?.toLowerCase().includes(query) ?? false
      const matchCountry = site.country?.toLowerCase().includes(query) ?? false
      return matchName || matchMission || matchAgency || matchCountry
    })
  }, [allSites, query])

  // Group filtered sites by category
  const groupedSites = useMemo(() => {
    const map = new Map<SiteCategory, Site[]>()
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, [])
    }
    for (const site of filteredSites) {
      const list = map.get(site.category)
      if (list) {
        list.push(site)
      } else {
        // Fallback for unexpected category
        map.set(site.category, [site])
      }
    }
    return map
  }, [filteredSites])

  const handleUseHere = (siteId: string) => {
    if (activeScenario) {
      updateScenario(activeScenario.id, { siteId })
    }
  }

  const handleCompare = (siteId: string) => {
    if (scenarios.length < MAX_SCENARIOS) {
      addScenario({ siteId })
    }
  }

  const canCompare = scenarios.length < MAX_SCENARIOS

  return (
    <section className={`site-library ${className ?? ''}`.trim()}>
      <div className="site-library__header">
        <h2 className="site-library__title">Site Library</h2>
        <input
          type="search"
          className="site-library__search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, mission, agency, country…"
          aria-label="Search sites"
        />
      </div>

      {loading && (
        <div className="placeholder" aria-busy="true">
          Loading site library…
        </div>
      )}

      {error && (
        <div className="placeholder" role="alert">
          <p>Could not load site library: {error}</p>
        </div>
      )}

      {!loading && !error && filteredSites.length === 0 && (
        <div className="site-library__empty" role="status">
          No site matches your search.
        </div>
      )}

      {!loading && !error && filteredSites.length > 0 && (
        <div className="site-library__groups">
          {CATEGORY_ORDER.map((category) => {
            const catSites = groupedSites.get(category) ?? []
            if (catSites.length === 0) return null

            return (
              <details
                key={`cat-${category}`}
                open
                className="site-library__group"
              >
                <summary className="site-library__summary">
                  <span>
                    {CATEGORY_TITLES[category]} ({catSites.length})
                  </span>
                </summary>
                <div className="site-library__group-content">
                  {catSites.map((site) => {
                    const isActive = site.id === activeSiteId
                    const missionAgency = [site.mission, site.agency]
                      .filter(Boolean)
                      .join(' · ')
                    const landingDate = formatLandingDate(site.landing_date_utc)
                    const sourceUrl = safeHttpsUrl(site.source.url)

                    return (
                      <div
                        key={`site-row-${site.id}`}
                        className={`site-row ${isActive ? 'site-row--active' : ''}`}
                      >
                        <div className="site-row__col-main">
                          <span className="site-row__name">{site.name}</span>
                          {missionAgency && (
                            <span className="site-row__mission-agency">
                              {missionAgency}
                            </span>
                          )}
                        </div>

                        <div className="site-row__col-status">
                          <span className="site-row__status">
                            {formatStatus(site.status)}
                          </span>
                          {landingDate && (
                            <span
                              className="site-row__date"
                              title={`Landing date (UTC): ${site.landing_date_utc}`}
                            >
                              {landingDate}
                            </span>
                          )}
                        </div>

                        <div className="site-row__coords">
                          {formatCoordDisplay(site.lat_deg, site.lon_deg)}
                        </div>

                        <div className="site-row__source">
                          {sourceUrl ? (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="site-row__source-link"
                              title={site.source.title || 'Source data link'}
                            >
                              Source
                            </a>
                          ) : (
                            <span className="site-row__no-source">
                              {site.source.title || 'Synthetic test data, no source'}
                            </span>
                          )}
                        </div>

                        <div className="site-row__actions">
                          <button
                            type="button"
                            onClick={() => handleUseHere(site.id)}
                            disabled={isActive}
                            title={
                              isActive
                                ? 'This site is already used in the active scenario'
                                : 'Use this site in the active scenario'
                            }
                          >
                            Use here
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCompare(site.id)}
                            disabled={!canCompare}
                            title={
                              !canCompare
                                ? `Maximum of ${MAX_SCENARIOS} scenarios reached`
                                : 'Add a new scenario comparing this site'
                            }
                          >
                            Compare
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default SiteLibrary
