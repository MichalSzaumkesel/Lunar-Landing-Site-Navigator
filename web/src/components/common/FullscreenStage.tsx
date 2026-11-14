/*
 * Shared full screen wrapper: owns the target element, the button state and the full Transport bar
 * that appears at the bottom while enlarged. The caller decides where the button sits by placing
 * the node passed to the children function.
 */
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Transport } from '../../app/Transport'
import { FullscreenButton } from './FullscreenButton'

export interface FullscreenStageProps {
  className?: string
  dataTour?: string
  /** Called when the full screen state changes. */
  onChange?: (active: boolean) => void
  children: (button: ReactNode) => ReactNode
}

export function FullscreenStage({ className, dataTour, onChange, children }: FullscreenStageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const handle = (a: boolean) => {
    setActive(a)
    onChange?.(a)
  }
  return (
    <div ref={ref} className={className} data-tour={dataTour}>
      {children(<FullscreenButton targetRef={ref} onChange={handle} />)}
      {active && <Transport />}
    </div>
  )
}
