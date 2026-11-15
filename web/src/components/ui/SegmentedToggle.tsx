import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import './segmentedToggle.css'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
  /** Optional decorative icon shown before the label. */
  icon?: ReactNode
  /** Tooltip for the segment. */
  title?: string
  /** Accessible name when it should differ from the visible label. */
  ariaLabel?: string
}

interface Props<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  /** Size segments to their content (thumb follows the measured segment) instead of equal columns. */
  fit?: boolean
  className?: string
}

/** Segmented radio group with a sliding highlight and arrow/Home/End key support. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fit = false,
  className = '',
}: Props<T>) {
  const index = Math.max(0, options.findIndex((o) => o.id === value))
  const ref = useRef<HTMLDivElement>(null)

  // In fit mode segments have different widths: place the thumb from the measured active segment.
  useLayoutEffect(() => {
    const root = ref.current
    if (!fit || !root) return
    const place = (): void => {
      const btn = root.querySelectorAll<HTMLElement>('button[role="radio"]')[index]
      if (!btn) return
      root.style.setProperty('--seg-x', `${btn.offsetLeft}px`)
      root.style.setProperty('--seg-w', `${btn.offsetWidth}px`)
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(root)
    return () => ro.disconnect()
  }, [fit, index, options])

  const style = { '--seg-n': options.length, '--seg-i': index } as CSSProperties
  return (
    <div
      ref={ref}
      className={`segtoggle${fit ? ' segtoggle--fit' : ''} ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      data-index={index}
      style={style}
    >
      <span className="segtoggle__thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          aria-label={o.ariaLabel}
          title={o.title}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            let nextIndex: number
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIndex = (index + 1) % options.length
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
            else if (e.key === 'Home') nextIndex = 0
            else if (e.key === 'End') nextIndex = options.length - 1
            else return
            e.preventDefault()
            onChange(options[nextIndex].id)
            e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[nextIndex]?.focus()
          }}
        >
          {o.icon}
          <span className="segtoggle__label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
