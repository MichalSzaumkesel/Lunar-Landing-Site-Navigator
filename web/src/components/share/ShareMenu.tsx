import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { usePresence } from '../../lib/usePresence'
import { PrintBrief } from '../print/PrintBrief'
import { copyShareLink, exportScenariosCsv } from './shareActions'
import './share.css'

export interface ShareMenuProps {
  /** Simple mode: CSV and dossier are not offered, the link still is. */
  advancedDisabled?: boolean
}

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }): ReactElement {
  return (
    <svg
      className="share-menu__icon"
      width={size}
      height={size}
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

const LinkIcon = () => (
  <Icon>
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </Icon>
)
const TableIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M3 15h18M9 4v16" />
  </Icon>
)
const PrinterIcon = () => (
  <Icon>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </Icon>
)

/** One "Share and export" button with a menu: copy link, export CSV, open the print dossier. */
export function ShareMenu({ advancedDisabled = false }: ShareMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuId = useId()

  const presence = usePresence(open)

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  const items = useCallback(
    (): HTMLButtonElement[] =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
      ),
    [],
  )

  const openMenu = () => setOpen(true)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // Focus the first item once the menu is rendered.
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
      resetNotes()
      openMenu()
    } else if (e.key === 'Escape' && open) {
      close(true)
    }
  }

  const resetNotes = () => {
    setFallbackUrl(null)
    setError(null)
  }

  const onCopy = async () => {
    close(true)
    resetNotes()
    const fallback = await copyShareLink()
    if (fallback === null) {
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2000)
    } else {
      setFallbackUrl(fallback)
      setError('Could not copy. Copy the address from the box.')
    }
  }

  const onCsv = async () => {
    close(true)
    resetNotes()
    setBusy(true)
    try {
      await exportScenariosCsv()
    } catch (err) {
      setError(`Could not export CSV: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const onDossier = () => {
    close(true)
    resetNotes()
    if (typeof window.print === 'function') window.print()
  }

  const label = busy ? 'Exporting…' : copied ? 'Link copied' : 'Share and export'

  return (
    <div className="share-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="share-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={presence.mounted ? menuId : undefined}
        title="Copy a link, export CSV or open the printable dossier"
        onClick={() => {
          resetNotes()
          if (open) close(false)
          else openMenu()
        }}
        onKeyDown={onTriggerKey}
      >
        <Icon>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </Icon>
        <span>{label}</span>
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
      <span className="share-menu__live" role="status" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>

      {presence.mounted && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Share and export"
          className="share-menu__popup"
          data-state={presence.state}
          onKeyDown={onMenuKey}
        >
          <button type="button" role="menuitem" className="share-menu__item" onClick={onCopy}>
            <LinkIcon />
            <span className="share-menu__text">
              <span className="share-menu__title">Copy link</span>
              <span className="share-menu__desc">
                Copies a link that restores these scenarios, dates and rules.
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="share-menu__item"
            disabled={advancedDisabled || busy}
            onClick={onCsv}
          >
            <TableIcon />
            <span className="share-menu__text">
              <span className="share-menu__title">Export CSV</span>
              <span className="share-menu__desc">
                Downloads the metrics and events of every scenario as a spreadsheet file.
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="share-menu__item"
            disabled={advancedDisabled}
            onClick={onDossier}
          >
            <PrinterIcon />
            <span className="share-menu__text">
              <span className="share-menu__title">Export dossier</span>
              <span className="share-menu__desc">Opens a one-page brief to print or save as PDF.</span>
            </span>
          </button>
        </div>
      )}

      {(error || fallbackUrl) && (
        <div className="share-menu__note">
          {error && (
            <p role="alert" className="share-error">
              {error}
            </p>
          )}
          {fallbackUrl && (
            <input
              type="text"
              readOnly
              value={fallbackUrl}
              className="share-fallback-input"
              aria-label="Share URL fallback"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </div>
      )}

      {createPortal(<PrintBrief />, document.body)}
    </div>
  )
}
