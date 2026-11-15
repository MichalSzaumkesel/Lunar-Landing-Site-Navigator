import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * "Lander" button on the 3D frame and the panel it opens over the canvas (position nudge, Sun visible
 * hours, map legend). The panel stays mounted while closed (hidden with visibility), so the keyboard
 * nudge control keeps existing; it takes no room in the controls column.
 */
export function LanderPopover({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('.surface__nudge-control')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) {
        setOpen(false)
        // The scene reads this flag on the same pointerdown and skips terrain picking for this click.
        if (e.target instanceof HTMLCanvasElement) e.target.dataset.swallowClick = '1'
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])

  return (
    <div className="surface__lander-pop" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="surface__lander-btn"
        aria-expanded={open}
        aria-controls={id}
        title={`Lander position and Sun visible hours (${summary})`}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M8 1.5 5.5 5v3.2L3 12.5l1 1 2-1.3h4l2 1.3 1-1-2.5-4.3V5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        Lander
      </button>
      <div
        ref={panel}
        id={id}
        className="surface__lander-panel"
        role="group"
        aria-label="Lander and sunlight hours"
        data-state={open ? 'open' : 'closed'}
      >
        {children}
      </div>
    </div>
  )
}
