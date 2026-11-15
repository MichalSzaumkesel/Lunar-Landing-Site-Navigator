/*
 * Shared full screen wrapper: owns the target element and the single fullscreen state, plus the
 * full Transport bar that appears at the bottom while enlarged. The state lives here (not in the
 * button) so moving the button between slots, e.g. when a view switches, never resets it.
 * The caller decides where the button sits by placing the node passed to the children function.
 * With persistentExit the in-slot button is replaced while enlarged by one fixed top-right exit
 * button, so the way out never depends on which view is mounted.
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Transport } from '../../app/Transport'
import { FullscreenToggle } from './FullscreenButton'
import { useFullscreen } from './useFullscreen'

export interface FullscreenStageProps {
  className?: string
  dataTour?: string
  /** Called when the full screen state changes. */
  onChange?: (active: boolean) => void
  /** Show one fixed exit button while enlarged and hide the slot button. */
  persistentExit?: boolean
  children: (button: ReactNode) => ReactNode
}

export function FullscreenStage({ className, dataTour, onChange, persistentExit = false, children }: FullscreenStageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const control = useFullscreen(ref)
  const { active } = control
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    onChangeRef.current?.(active)
  }, [active])
  const hideSlot = persistentExit && active
  return (
    <div ref={ref} className={className} data-tour={dataTour}>
      {children(hideSlot ? null : <FullscreenToggle control={control} />)}
      {hideSlot && <FullscreenToggle control={control} className="fs-button--exit" />}
      {active && <Transport />}
    </div>
  )
}
