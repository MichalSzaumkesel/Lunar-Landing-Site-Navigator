import { useEffect, useState, type ChangeEvent } from 'react'
import { dataSource } from '../../lib/loader'
import type { Site } from '../../lib/types'
import { useAppStore } from '../../state/store'
import { displayName, groupPlaces, placeHint, quickPlaces } from './placeLabels'

// Contrasting examples first: equator, south pole, far side. Missing ids are skipped.
const QUICK_IDS = ['apollo_11', 'southpole_landed', 'change_4', 'artemis_region_1'] as const

export interface PlacePickerProps {
  activeSiteId: string
}

export function PlacePicker({ activeSiteId }: PlacePickerProps) {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const updateScenario = useAppStore((s) => s.updateScenario)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)

  const reloadSites = () => {
    setHasError(false)
    setSites(null)
    setRetryCount((c) => c + 1)
  }

  useEffect(() => {
    let cancelled = false
    dataSource
      .loadSites()
      .then((file) => {
        if (!cancelled) {
          setSites(file.sites)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [retryCount])

  // Keeps the chosen start date and time position: only the site changes.
  const selectSite = (siteId: string) => {
    updateScenario(activeScenarioId, { siteId })
  }

  if (hasError) {
    return (
      <div className="simple-places-error" role="alert" data-tour="simple-places">
        <span>Could not load the list of places. Check your connection and try again.</span>
        <button type="button" onClick={reloadSites}>
          Try again
        </button>
      </div>
    )
  }

  if (!sites) {
    return (
      <div className="simple-places" role="group" aria-label="Choose a place" data-tour="simple-places" aria-busy="true">
        <span className="simple-place-btn simple-place-btn--loading">Loading places…</span>
      </div>
    )
  }

  const quick = quickPlaces(sites, QUICK_IDS)
  const groups = groupPlaces(sites)

  return (
    <div className="simple-places" role="group" aria-label="Choose a place" data-tour="simple-places">
      {quick.map((site) => {
        const isSelected = activeSiteId === site.id
        return (
          <button
            key={site.id}
            type="button"
            className={`simple-place-btn ${isSelected ? 'simple-place-btn--pressed' : ''}`}
            aria-pressed={isSelected}
            onClick={() => selectSite(site.id)}
          >
            <span className="simple-place-btn__title">{displayName(site)}</span>
            <span className="simple-place-btn__caption">{placeHint(site)}</span>
          </button>
        )
      })}
      <label className="simple-place-select">
        <span className="simple-place-select__label">All places ({sites.length})</span>
        <select
          value={activeSiteId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => selectSite(e.target.value)}
        >
          {groups.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {g.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {displayName(s)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </div>
  )
}
