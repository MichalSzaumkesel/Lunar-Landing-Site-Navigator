import { revealSections } from '../../lib/disclosure'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTourStore } from '../help/tourState'
import { useAppStore } from '../../state/store'
import { useDemoStore } from './demoState'
import type { DemoVariant } from './demoState'
import { DEMO_STEPS } from './demoSteps'
import type { DemoStep } from './demoSteps'
import { planVideoSteps } from './videoScript'
import { useDemoContext } from './useDemoContext'

export interface DemoController {
  isActive: boolean
  stepIndex: number
  variant: DemoVariant
  currentStep: DemoStep | undefined
  caption: string
  startDemo: (variant?: DemoVariant) => void
  stopDemo: () => void
  setVariant: (variant: DemoVariant) => void
}

export function useDemo(): DemoController {
  const isActive = useDemoStore((s) => s.isActive)
  const stepIndex = useDemoStore((s) => s.stepIndex)
  const variant = useDemoStore((s) => s.variant)
  const nextStep = useDemoStore((s) => s.nextStep)
  const storeStop = useDemoStore((s) => s.stopDemo)
  const storeStart = useDemoStore((s) => s.startDemo)
  const setVariant = useDemoStore((s) => s.setVariant)
  const closeTour = useTourStore((s) => s.closeTour)

  const ctx = useDemoContext()
  const ctxRef = useRef(ctx)
  useEffect(() => {
    ctxRef.current = ctx
  }, [ctx])

  const stopDemo = useCallback(() => {
    useAppStore.getState().setPlaying(false)
    storeStop()
  }, [storeStop])

  const startDemo = useCallback(
    (v?: DemoVariant) => {
      closeTour()
      storeStart(v)
    },
    [closeTour, storeStart],
  )

  const steps = useMemo(() => {
    return variant === 'video30s' ? planVideoSteps(30000) : DEMO_STEPS
  }, [variant])

  const currentStep = steps[stepIndex]

  // Execute step action once per step and schedule timer for narration progression
  useEffect(() => {
    if (!isActive) return
    const step = steps[stepIndex]
    if (!step) return

    useDemoStore.setState({ loupeOpen: step.showLoupe === true })
    revealSections(step.reveal ?? [])
    const store = useAppStore.getState()
    step.run(store, ctxRef.current)

    const timer = setTimeout(() => {
      if (variant === 'video30s' && stepIndex >= steps.length - 1) {
        // Video finished after end card
        stopDemo()
      } else {
        nextStep(steps.length)
      }
    }, step.durationMs)

    return () => {
      clearTimeout(timer)
    }
  }, [isActive, stepIndex, steps, variant, nextStep, stopDemo])

  // Sections the demo opened close again when it ends.
  useEffect(() => {
    if (!isActive) revealSections([])
  }, [isActive])

  // Esc or any key stops the demo and leaves the app in a normal state
  useEffect(() => {
    if (!isActive) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        stopDemo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isActive, stopDemo])

  const caption = isActive && currentStep ? currentStep.caption(ctx) : ''

  return {
    isActive,
    stepIndex,
    variant,
    currentStep,
    caption,
    startDemo,
    stopDemo,
    setVariant,
  }
}
