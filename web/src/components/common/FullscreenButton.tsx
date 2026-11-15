/*
 * Reusable full screen control.
 *
 * Usage: give the element to enlarge a ref and render the button inside it (top right):
 *
 *   const ref = useRef<HTMLDivElement>(null)
 *   <div ref={ref} className="card"> ... <FullscreenButton targetRef={ref} onChange={setFs} /> </div>
 *
 * While active the target gets data-fullscreen="true"; style the enlarged layout with it.
 * The button hides itself when the Fullscreen API is unavailable or disabled. On iOS Safari a
 * CSS overlay (position: fixed, inset 0) is used instead; see FullscreenButton.css.
 */
import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useFullscreen } from './useFullscreen'
import type { FullscreenControl } from './useFullscreen'
import './FullscreenButton.css'

export interface FullscreenButtonProps {
  targetRef: RefObject<HTMLElement | null>
  /** Called when the full screen state changes. */
  onChange?: (active: boolean) => void
  className?: string
}

/** Presentational toggle driven by a control owned higher up (it survives this button remounting). */
export function FullscreenToggle({ control, className = '' }: { control: FullscreenControl; className?: string }) {
  const { mode, active, toggle } = control
  if (mode === 'none') return null
  const label = active ? 'Exit full screen' : 'Full screen'
  return (
    <button
      type="button"
      className={`fs-button ${className}`.trim()}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {active ? (
          <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
        ) : (
          <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
        )}
      </svg>
    </button>
  )
}

export function FullscreenButton({ targetRef, onChange, className = '' }: FullscreenButtonProps) {
  const control = useFullscreen(targetRef)

  useEffect(() => {
    onChange?.(control.active)
  }, [control.active, onChange])

  return <FullscreenToggle control={control} className={className} />
}
