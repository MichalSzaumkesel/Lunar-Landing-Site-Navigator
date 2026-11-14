import { useCallback, useEffect, useRef } from 'react'
import { useTourStore } from '../help/tourState'
import { useAppStore } from '../../state/store'
import { useDemoStore } from './demoState'
import { DEMO_STEPS } from './demoSteps'
import type { DemoStep } from './demoSteps'
import { useDemoContext } from './useDemoContext'

export interface DemoController {
  isActive: boolean
  stepIndex: number
  currentStep: DemoStep | undefined
  caption: string
  startDemo: () => void
  stopDemo: () => void
}

export function useDemo(): DemoController {
  const isActive = useDemoStore((s) => s.isActive)
  const stepIndex = useDemoStore((s) => s.stepIndex)
  const nextStep = useDemoStore((s) => s.nextStep)
  const storeStop = useDemoStore((s) => s.stopDemo)
  const storeStart = useDemoStore((s) => s.startDemo)
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

  const startDemo = useCallback(() => {
    closeTour()
    storeStart()
  }, [closeTour, storeStart])

  const currentStep = DEMO_STEPS[stepIndex]

  // Execute step action once per step and schedule timer for narration progression
  useEffect(() => {
    if (!isActive) return
    const step = DEMO_STEPS[stepIndex]
    if (!step) return

    const store = useAppStore.getState()
    step.run(store, ctxRef.current)

    const timer = setTimeout(() => {
      nextStep(DEMO_STEPS.length)
    }, step.durationMs)

    return () => {
      clearTimeout(timer)
    }
  }, [isActive, stepIndex, nextStep])

  // Esc or any key stops the demo and leaves the app in a normal state
  useEffect(() => {
    if (!isActive) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
      }
      stopDemo()
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
    currentStep,
    caption,
    startDemo,
    stopDemo,
  }
}
