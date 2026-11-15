import { useEffect, useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Site } from '../../lib/types'
import { useAppStore } from '../../state/store'
import { groupByCategory } from './cardLogic'
import { loadCuratedSites } from './curatedSites'
import './scenario.css'

/** In-place site switcher for one scenario card. */
export function SiteSelect({ scenarioId, siteId }: { scenarioId: string; siteId: string }) {
  const id = useId()
  const updateScenario = useAppStore((s) => s.updateScenario)
  const [sites, setSites] = useState<Site[]>([])

  useEffect(() => {
    let live = true
    void loadCuratedSites().then((list) => {
      if (live) setSites(list)
    })
    return () => {
      live = false
    }
  }, [])

  if (sites.length === 0) return null
  const known = sites.some((s) => s.id === siteId)
  const onChange = (e: ChangeEvent<HTMLSelectElement>) => {
    updateScenario(scenarioId, { siteId: e.target.value })
  }

  return (
    <div className="site-select">
      <select id={id} aria-label="Site" value={siteId} onChange={onChange} onClick={(e) => e.stopPropagation()}>
        {!known && <option value={siteId}>Custom site</option>}
        {groupByCategory(sites).map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
