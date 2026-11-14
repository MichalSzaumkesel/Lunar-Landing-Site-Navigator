import { lazy, Suspense, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

// Each panel is its own lazy chunk, so the first screen stays small.
const WindowMapPanel = lazy(() => import('./WindowMapPanel'))
const MapPanel = lazy(() => import('../components/map/MapPanel').then((m) => ({ default: m.MapPanel })))
const SiteLibrary = lazy(() =>
  import('../components/library/SiteLibrary').then((m) => ({ default: m.SiteLibrary })),
)

const TABS = [
  { id: 'window-map', label: 'Window map', hint: 'Which site and landing date fits your mission rules' },
  { id: 'moon-map', label: 'Moon map', hint: 'Sites on the Moon with day and night' },
  { id: 'sites', label: 'Site library', hint: 'All sites with their sources' },
] as const

type TabId = (typeof TABS)[number]['id']

/** Lower section of the Advanced layout: window map, Moon map and site library as tabs. */
export function Panels() {
  const [active, setActive] = useState<TabId>('window-map')
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === active)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    setActive(TABS[next].id)
    refs.current[TABS[next].id]?.focus()
  }

  return (
    <section className="panels" aria-label="Sites and windows">
      <div
        className="panels__tabs"
        role="tablist"
        aria-label="Sites and windows"
        data-tour="panels"
        onKeyDown={onKeyDown}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            title={t.hint}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={active} className="panels__body" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        <Suspense fallback={<div className="placeholder" aria-busy="true">Loading</div>}>
          {active === 'window-map' && <WindowMapPanel />}
          {active === 'moon-map' && <MapPanel />}
          {active === 'sites' && <SiteLibrary />}
        </Suspense>
      </div>
    </section>
  )
}
