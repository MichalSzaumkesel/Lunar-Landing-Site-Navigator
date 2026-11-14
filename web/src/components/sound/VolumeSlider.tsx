import { useRef, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'

export interface VolumeSliderProps {
  /** Volume in percent, 0 to 100. */
  value: number
  onChange: (percent: number) => void
}

const STEP = 5

function clamp(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)))
}

function SpeakerIcon({ value }: { value: number }): ReactElement {
  return (
    <svg className="volume-slider__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
      {value === 0 && <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" />}
      {value > 0 && <path d="M11 6.5a2.5 2.5 0 010 3" stroke="currentColor" strokeWidth="1.5" fill="none" />}
      {value > 50 && <path d="M12.5 4.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.5" fill="none" />}
    </svg>
  )
}

/** Draggable segmented-style volume bar with keyboard support. */
export function VolumeSlider({ value, onChange }: VolumeSliderProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  const setFromPointer = (e: PointerEvent<HTMLDivElement>): void => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    onChange(clamp(((e.clientX - rect.left) / rect.width) * 100))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const next: Record<string, number> = {
      ArrowRight: value + STEP,
      ArrowUp: value + STEP,
      ArrowLeft: value - STEP,
      ArrowDown: value - STEP,
      Home: 0,
      End: 100,
    }
    if (!(e.key in next)) return
    e.preventDefault()
    onChange(clamp(next[e.key]))
  }

  return (
    <div
      ref={ref}
      className="volume-slider"
      role="slider"
      tabIndex={0}
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        setFromPointer(e)
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) setFromPointer(e)
      }}
    >
      <div className="volume-slider__fill" style={{ width: `${value}%` }} />
      <SpeakerIcon value={value} />
      <span className="volume-slider__text">{value}%</span>
    </div>
  )
}
