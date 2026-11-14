import { useEffect, useState } from 'react'
import { categoryLabel } from '../scenario/cardLogic'
import { dataSource } from '../../lib/loader'
import type { Site } from '../../lib/types'
import { useAppStore } from '../../state/store'

const DEMO_SITE_IDS = ['apollo_11', 'southpole_landed', 'artemis_region_1'] as const

export interface PlacePickerProps {
  activeSiteId: string
}

export function PlacePicker({ activeSiteId }: PlacePickerProps) {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const applyPreset = useAppStore((s) => s.applyPreset)

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

  const handleSelect = (site: Site) => {
    const displayName = site.name.replace(/^\[MOCK\]\s*/i, '')
    applyPreset({
      id: site.id,
      label: displayName,
      description: site.notes || displayName,
      scenarios: [{ siteId: site.id }],
    })
  }

  if (hasError) {
    return (
      <div
        className="simple-places-error"
        role="alert"
        data-tour="simple-places"
      >
        <span>Could not load this place. Try another place.</span>
        <button type="button" onClick={reloadSites}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div
      className="simple-places"
      role="group"
      aria-label="Select lunar landing site"
      data-tour="simple-places"
    >
      {DEMO_SITE_IDS.map((id) => {
        const site = sites?.find((s) => s.id === id)
        const isSelected = activeSiteId === id

        if (sites && !site) {
          return (
            <button
              key={id}
              type="button"
              className="simple-place-btn"
              disabled
              aria-disabled="true"
            >
              <span className="simple-place-btn__title">Not available</span>
              <span className="simple-place-btn__caption">Not available</span>
            </button>
          )
        }

        if (!site) {
          return (
            <button
              key={id}
              type="button"
              className="simple-place-btn simple-place-btn--loading"
              disabled
              aria-busy="true"
            >
              <span className="simple-place-btn__title">Loading…</span>
            </button>
          )
        }

        const displayName = site.name.replace(/^\[MOCK\]\s*/i, '')
        const caption = categoryLabel(site.category)

        return (
          <button
            key={id}
            type="button"
            className={`simple-place-btn ${isSelected ? 'simple-place-btn--pressed' : ''}`}
            aria-pressed={isSelected}
            onClick={() => handleSelect(site)}
          >
            <span className="simple-place-btn__title">{displayName}</span>
            <span className="simple-place-btn__caption">{caption}</span>
          </button>
        )
      })}
    </div>
  )
}
