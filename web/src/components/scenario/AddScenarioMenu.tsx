import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { PRESETS, PRESET_APOLLO_VS_ARTEMIS, type Preset } from '../../config/presets'
import { usePresence } from '../../lib/usePresence'
import '../share/share.css'
import './addMenu.css'

export interface AddScenarioMenuProps {
  /** Maximum number of cards reached: adding is disabled, presets still replace the cards. */
  full: boolean
  onAdd: () => void
  onPreset: (preset: Preset) => void
}

function Icon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      className="share-menu__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const PRESET_ICONS: Record<string, ReactElement> = {
  apollo11_vs_artemis: (
    <Icon>
      <rect x="3" y="4" width="8" height="16" rx="1.5" />
      <rect x="13" y="4" width="8" height="16" rx="1.5" />
    </Icon>
  ),
  south_pole: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M9 18l3 3 3-3" />
    </Icon>
  ),
  same_site_slip: (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 15h6M13 13l2 2-2 2" />
    </Icon>
  ),
}

/** Split control: the main part adds a card, the chevron opens a menu with "Add card" and the presets. */
export function AddScenarioMenu({ full, onAdd, onPreset }: AddScenarioMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()
  const presence = usePresence(open)

  const items = useCallback(
    (): HTMLButtonElement[] =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []),
    [],
  )

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (open && presence.mounted) items()[0]?.focus()
  }, [open, presence.mounted, items])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Tab') {
      close(false)
      return
    }
    if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus()
    else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus()
    else if (e.key === 'Home') list[0]?.focus()
    else if (e.key === 'End') list[list.length - 1]?.focus()
    else if (e.key === 'Escape') close(true)
    else return
    e.preventDefault()
  }

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
    } else if (e.key === 'Escape' && open) {
      close(true)
    }
  }

  return (
    <div className="add-menu" ref={wrapRef} data-tour="add-scenario">
      <div className="add-menu__split">
        <button
          type="button"
          className="accent add-menu__main"
          disabled={full}
          title={full ? 'Four scenarios is the maximum' : 'Adds a card for the same site and dates'}
          onClick={onAdd}
        >
          Add scenario
        </button>
        <button
          ref={triggerRef}
          type="button"
          className="accent add-menu__toggle"
          data-demo="add-menu-toggle"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={presence.mounted ? menuId : undefined}
          aria-label="Scenario menu: add a card or load a preset"
          title="Add a card or load a ready-made comparison"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKey}
        >
          <svg
            className="share-menu__chevron"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {presence.mounted && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Add scenario"
          className="share-menu__popup add-menu__popup"
          data-state={presence.state}
          onKeyDown={onMenuKey}
        >
          <button
            type="button"
            role="menuitem"
            className="share-menu__item"
            disabled={full}
            onClick={() => {
              close(true)
              onAdd()
            }}
          >
            <Icon>
              <path d="M12 5v14M5 12h14" />
            </Icon>
            <span className="share-menu__text">
              <span className="share-menu__title">Add card</span>
              <span className="share-menu__desc">Adds a card for the same site and dates.</span>
            </span>
          </button>
          <div role="separator" className="add-menu__sep" />
          <div className="add-menu__heading" aria-hidden="true">
            Presets
          </div>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className="share-menu__item"
              data-preset={p.id}
              data-featured={p.id === PRESET_APOLLO_VS_ARTEMIS.id ? 'true' : undefined}
              onClick={() => {
                close(true)
                onPreset(p)
              }}
            >
              {PRESET_ICONS[p.id]}
              <span className="share-menu__text">
                <span className="share-menu__title">{p.label}</span>
                <span className="share-menu__desc">{p.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
