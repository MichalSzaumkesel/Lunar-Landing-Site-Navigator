import './segmentedToggle.css'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
}

interface Props<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/** Two-way segmented radio group with a sliding highlight and arrow-key support. */
export function SegmentedToggle<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  const index = Math.max(0, options.findIndex((o) => o.id === value))
  return (
    <div className="segtoggle" role="radiogroup" aria-label={ariaLabel} data-index={index}>
      <span className="segtoggle__thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => {
            const step =
              e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (step === 0) return
            e.preventDefault()
            const nextIndex = (index + step + options.length) % options.length
            onChange(options[nextIndex].id)
            e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[nextIndex]?.focus()
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
