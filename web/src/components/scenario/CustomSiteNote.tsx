import { useEffect, useState } from 'react'
import type { Site } from '../../lib/types'
import { useAppStore } from '../../state/store'
import { nearestSite } from './cardLogic'
import { loadCuratedSites } from './curatedSites'
import './scenario.css'

/** Card note for a custom point: its horizon has no terrain, so point to the closest real site. */
export function CustomSiteNote({ site, scenarioId }: { site: Pick<Site, 'lat_deg' | 'lon_deg'>; scenarioId: string }) {
  const [sites, setSites] = useState<Site[]>([])
  const updateScenario = useAppStore((s) => s.updateScenario)

  useEffect(() => {
    let live = true
    void loadCuratedSites().then((list) => {
      if (live) setSites(list)
    })
    return () => {
      live = false
    }
  }, [])

  const near = nearestSite(site.lat_deg, site.lon_deg, sites)
  return (
    <p className="card__note" role="note">
      The horizon of a custom point is a smooth-sphere approximation without terrain, so ridges and craters are not
      shown.
      {near && (
        <>
          {' '}
          Nearest real site: {near.name}, {Math.round(near.distanceKm)} km away.{' '}
          <button type="button" className="ghost" onClick={() => updateScenario(scenarioId, { siteId: near.id })}>
            Use {near.name}
          </button>
        </>
      )}
    </p>
  )
}
