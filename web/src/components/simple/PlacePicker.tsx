import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { dataSource } from '../../lib/loader'
import type { Site } from '../../lib/types'
import { useAppStore } from '../../state/store'
import { displayName, groupPlaces, placeDescription } from './placeLabels'

export interface PlacePickerProps {
  activeSiteId: string
}

export function PlacePicker({ activeSiteId }: PlacePickerProps) {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
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

  // Keeps the selected row in view inside the list; no motion for people who ask for less.
  useEffect(() => {
    if (!sites) return
    const row = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    row?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [sites, activeSiteId])

  // Keeps the chosen start date and time position: only the site changes.
  const selectSite = (siteId: string) => {
    updateScenario(activeScenarioId, { siteId })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const options = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'))
    const at = options.indexOf(document.activeElement as HTMLElement)
    let next = -1
    if (e.key === 'ArrowDown') next = Math.min(options.length - 1, at + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, at - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = options.length - 1
    if (next < 0) return
    e.preventDefault()
    options[next]?.focus()
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
        <span className="simple-place-loading">Loading places…</span>
      </div>
    )
  }

  const groups = groupPlaces(sites)
  // Roving tabindex: one tab stop, on the selected row (or the first when none matches).
  const tabStopId = sites.some((s) => s.id === activeSiteId) ? activeSiteId : sites[0]?.id

  return (
    <div className="simple-places" data-tour="simple-places">
      <ul
        ref={listRef}
        className="simple-place-list"
        role="listbox"
        aria-label="Choose a place"
        onKeyDown={onKeyDown}
      >
        {groups.map((g) => (
          <li key={g.id} role="presentation" className="simple-place-group">
            <ul role="group" aria-labelledby={`place-group-${g.id}`} className="simple-place-group__list">
              <li role="presentation" id={`place-group-${g.id}`} className="simple-place-group__heading">
                {g.label}
              </li>
              {g.sites.map((site) => {
                const isSelected = activeSiteId === site.id
                return (
                  <li
                    key={site.id}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={site.id === tabStopId ? 0 : -1}
                    className={`simple-place-row ${isSelected ? 'simple-place-row--selected' : ''}`}
                    onClick={() => selectSite(site.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectSite(site.id)
                      }
                    }}
                  >
                    <span className="simple-place-row__title">{displayName(site)}</span>
                    <span className="simple-place-row__desc">{placeDescription(site)}</span>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
