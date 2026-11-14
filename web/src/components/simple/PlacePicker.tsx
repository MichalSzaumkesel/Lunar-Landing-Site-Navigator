import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { dataSource } from '../../lib/loader'
import type { Site } from '../../lib/types'
import { usePresence } from '../../lib/usePresence'
import { useAppStore } from '../../state/store'
import { GROUP_LABEL, displayName, filterPlaces, groupPlaces, placeDescription, type PlaceGroup } from './placeLabels'

export interface PlacePickerProps {
  activeSiteId: string
}

type Filter = PlaceGroup['id'] | 'all'

function Chevron() {
  return (
    <svg className="place-trigger__chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Check() {
  return (
    <svg className="place-option__check" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PlacePicker({ activeSiteId }: PlacePickerProps) {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [hasError, setHasError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const updateScenario = useAppStore((s) => s.updateScenario)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const { mounted, state } = usePresence(open)

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
        if (!cancelled) setSites(file.sites)
      })
      .catch(() => {
        if (!cancelled) setHasError(true)
      })
    return () => {
      cancelled = true
    }
  }, [retryCount])

  const visible = useMemo(() => (sites ? filterPlaces(sites, query, filter) : []), [sites, query, filter])
  const groups = useMemo(() => (sites ? groupPlaces(sites) : []), [sites])

  const openPanel = () => {
    const at = sites ? sites.findIndex((s) => s.id === activeSiteId) : -1
    setQuery('')
    setFilter('all')
    setActive(Math.max(0, at))
    setOpen(true)
  }

  const closePanel = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  // Focus the search field on open (the panel mounts in the same render that sets open).
  useEffect(() => {
    if (open && mounted) searchRef.current?.focus()
  }, [open, mounted])

  // Closes on a press outside the picker.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Keeps the highlighted row in view; no motion for people who ask for less.
  useEffect(() => {
    if (!open) return
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    row?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [open, active, visible])

  // Keeps the chosen start date and time position: only the site changes.
  const selectSite = (siteId: string) => {
    updateScenario(activeScenarioId, { siteId })
    closePanel(true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = visible.length - 1
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closePanel(true)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(last, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Home' && e.target === searchRef.current && query === '') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End' && e.target === searchRef.current && query === '') {
      e.preventDefault()
      setActive(Math.max(0, last))
    } else if (e.key === 'Enter' && e.target === searchRef.current) {
      e.preventDefault()
      const site = visible[active]
      if (site) selectSite(site.id)
    }
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

  const current = sites.find((s) => s.id === activeSiteId)
  const optionId = (id: string) => `${listId}-${id}`
  const activeSite = visible[active]
  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...groups.map((g) => ({ id: g.id, label: GROUP_LABEL[g.id] })),
  ]

  return (
    <div className="simple-places" data-tour="simple-places" ref={rootRef} onKeyDown={mounted ? onKeyDown : undefined}>
      <button
        ref={triggerRef}
        type="button"
        className="place-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={mounted ? `${listId}-panel` : undefined}
        aria-label={current ? `Place: ${displayName(current)}. Change place` : 'Choose a place'}
        onClick={() => (open ? closePanel(false) : openPanel())}
      >
        <span className="place-trigger__text">
          <span className="place-trigger__name">{current ? displayName(current) : 'Choose a place'}</span>
          {current && <span className="place-trigger__desc">{placeDescription(current)}</span>}
        </span>
        <Chevron />
      </button>

      {mounted && (
        <>
          <div className="place-backdrop" data-state={state} onClick={() => closePanel(true)} aria-hidden="true" />
          <div id={`${listId}-panel`} className="place-panel" data-state={state} role="dialog" aria-label="Choose a place">
            <div className="place-panel__top">
              <input
                ref={searchRef}
                type="search"
                className="place-search"
                placeholder="Search places"
                aria-label="Search places"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeSite ? optionId(activeSite.id) : undefined}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
              />
              <div className="place-tabs" role="group" aria-label="Type of place">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="place-tab"
                    aria-pressed={filter === t.id}
                    onClick={() => {
                      setFilter(t.id)
                      setActive(0)
                      searchRef.current?.focus()
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <ul ref={listRef} id={listId} className="place-list" role="listbox" aria-label="Places">
              {visible.map((site, i) => {
                const selected = site.id === activeSiteId
                return (
                  <li
                    key={site.id}
                    id={optionId(site.id)}
                    role="option"
                    aria-selected={selected}
                    data-active={i === active}
                    className={`place-option${selected ? ' place-option--selected' : ''}`}
                    onPointerMove={() => setActive(i)}
                    onClick={() => selectSite(site.id)}
                  >
                    <span className="place-option__text">
                      <span className="place-option__name">{displayName(site)}</span>
                      <span className="place-option__desc">{placeDescription(site)}</span>
                    </span>
                    {selected && <Check />}
                  </li>
                )
              })}
            </ul>
            {visible.length === 0 && <p className="place-empty">No places match. Clear the search or pick another type.</p>}
          </div>
        </>
      )}
    </div>
  )
}
