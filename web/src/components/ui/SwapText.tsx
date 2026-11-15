import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Text that fades in when its value changes. For values that change on a user action or a data load
 * (window metrics, summaries, labels), never for values that follow the Play cursor.
 * The first value renders without animation, so a fresh mount does not flash.
 */
export function SwapText({ value, className }: { value: ReactNode; className?: string }) {
  const [seen, setSeen] = useState(value)
  const [generation, setGeneration] = useState(0)
  if (value !== seen) {
    setSeen(value)
    setGeneration((g) => g + 1)
  }
  const cls = [generation > 0 ? 'swap-text' : '', className ?? ''].filter(Boolean).join(' ')
  // A new key re-creates the element, which restarts the CSS animation
  return (
    <span key={generation} className={cls || undefined}>
      {value}
    </span>
  )
}
