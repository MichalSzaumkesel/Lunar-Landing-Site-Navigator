import { lazy, Suspense, useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useDisclosure, useDisclosureStore } from '../lib/disclosure'
import type { ExploreTab } from '../lib/disclosure'
import { usePresence } from '../lib/usePresence'

// Each panel is its own lazy chunk, so the first screen stays small.
const WindowMapPanel = lazy(() => import('./WindowMapPanel'))
const MapPanel = lazy(() => import('../components/map/MapPanel').then((m) => ({ default: m.MapPanel })))
const SiteLibrary = lazy(() =>
  import('../components/library/SiteLibrary').then((m) => ({ default: m.SiteLibrary })),
)

const TABS = [
  { id: 'sites', label: 'Sites', hint: 'All sites with their sources' },
  { id: 'moon-map', label: 'Moon map', hint: 'Sites on the Moon with day and night' },
  { id: 'window-map', label: 'Window finder', hint: 'Which site and landing date fits your mission rules' },
] as const satisfies readonly { id: ExploreTab; label: string; hint: string }[]

/** Lower area of the Advanced layout: one row that expands into Sites, Moon map and Window finder. */
export function Panels() {
  const { open, setOpen } = useDisclosure('explore')
  const active = useDisclosureStore((s) => s.exploreTab)
  const openExplore = useDisclosureStore((s) => s.openExplore)
  const presence = usePresence(open)
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const bodyId = useId()

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === active)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    openExplore(TABS[next].id)
    refs.current[TABS[next].id]?.focus()
  }

  return (
    <section className="panels" data-open={open ? 'true' : 'false'} aria-label="Explore sites and windows">
      <div className="panels__bar" data-tour="panels">
        <button
          type="button"
          className="panels__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        >
          <svg className="disc__chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M5 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="panels__title">Explore sites and windows</span>
          <span className="panels__hint">Site library, Moon map, Window finder</span>
        </button>
        <div className="panels__tabs" role="tablist" aria-label="Sites and windows" onKeyDown={onKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={open && active === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={active === t.id ? 0 : -1}
              title={t.hint}
              onClick={() => openExplore(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div id={bodyId}>
        {presence.mounted && (
          <div className="presence-collapse" data-state={presence.state}>
            <div className="presence-collapse__inner">
              <div
                key={active}
                className="panels__body"
                role="tabpanel"
                id={`panel-${active}`}
                aria-labelledby={`tab-${active}`}
              >
                <Suspense fallback={<div className="placeholder" aria-busy="true">Loading</div>}>
                  {active === 'window-map' && <WindowMapPanel />}
                  {active === 'moon-map' && <MapPanel />}
                  {active === 'sites' && <SiteLibrary />}
                </Suspense>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
