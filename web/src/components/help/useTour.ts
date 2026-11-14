import { useCallback, useEffect } from 'react'
import { useAppStore } from '../../state/store'
import { revealSections, sectionsForTarget } from '../../lib/disclosure'
import {
  advancedSteps,
  nextAvailableStep,
  simpleSteps,
  type TourStep,
} from './tourSteps'
import {
  setStoredTourStatus,
  useTourStore,
} from './tourState'

export function useTour() {
  const mode = useAppStore((s) => s.mode)
  const isOpen = useTourStore((s) => s.isOpen)
  const stepIndex = useTourStore((s) => s.stepIndex)
  const dontShowAgain = useTourStore((s) => s.dontShowAgain)
  const closeTour = useTourStore((s) => s.closeTour)
  const setStepIndex = useTourStore((s) => s.setStepIndex)
  const setDontShowAgain = useTourStore((s) => s.setDontShowAgain)

  const steps: TourStep[] = mode === 'simple' ? simpleSteps : advancedSteps

  const exists = useCallback((selector: string) => {
    if (typeof document === 'undefined') return false
    // A target inside a collapsed section counts: the tour opens the section when the step is shown.
    return Boolean(document.querySelector(selector)) || sectionsForTarget(selector).length > 0
  }, [])

  // Switching level closes an open tour; it never opens by itself (see TourChip).
  useEffect(() => {
    if (useTourStore.getState().isOpen) closeTour()
  }, [mode, closeTour])

  // Automatically skip step if its target is not in DOM
  useEffect(() => {
    if (!isOpen) return
    const current = steps[stepIndex]
    if (current && !exists(current.target)) {
      const nextIdx = nextAvailableStep(steps, stepIndex, 1, exists)
      if (nextIdx !== -1) {
        setStepIndex(nextIdx)
      } else {
        const prevIdx = nextAvailableStep(steps, stepIndex, -1, exists)
        if (prevIdx !== -1) {
          setStepIndex(prevIdx)
        }
      }
    }
  }, [isOpen, stepIndex, steps, exists, setStepIndex])

  // Sections that hold the current target are opened for the step and released afterwards.
  const currentTarget = isOpen ? steps[stepIndex]?.target : undefined
  useEffect(() => {
    revealSections(currentTarget ? sectionsForTarget(currentTarget) : [])
    return () => revealSections([])
  }, [currentTarget])

  const returnFocus = useCallback(() => {
    if (typeof document === 'undefined') return
    const prev = useTourStore.getState().previousFocus
    if (prev && document.contains(prev)) {
      prev.focus({ preventScroll: true })
    } else {
      const btn = document.querySelector<HTMLElement>('[data-tour="help-button"]')
      btn?.focus({ preventScroll: true })
    }
  }, [])

  const nextStepAvailable = nextAvailableStep(steps, stepIndex, 1, exists)
  const prevStepAvailable = nextAvailableStep(steps, stepIndex, -1, exists)
  const isLastStep = nextStepAvailable === -1

  const handleNext = useCallback(() => {
    if (isLastStep) {
      setStoredTourStatus(mode, 'done')
      closeTour()
      returnFocus()
    } else {
      setStepIndex(nextStepAvailable)
    }
  }, [isLastStep, mode, closeTour, returnFocus, setStepIndex, nextStepAvailable])

  const handleBack = useCallback(() => {
    if (prevStepAvailable !== -1) {
      setStepIndex(prevStepAvailable)
    }
  }, [prevStepAvailable, setStepIndex])

  const handleSkip = useCallback(() => {
    setStoredTourStatus(mode, 'done')
    closeTour()
    returnFocus()
  }, [mode, closeTour, returnFocus])

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      setStoredTourStatus(mode, 'done')
    }
    closeTour()
    returnFocus()
  }, [dontShowAgain, mode, closeTour, returnFocus])

  return {
    isOpen,
    stepIndex,
    currentStep: steps[stepIndex] ?? steps[0],
    totalSteps: steps.length,
    dontShowAgain,
    setDontShowAgain,
    isLastStep,
    canGoBack: prevStepAvailable !== -1,
    handleNext,
    handleBack,
    handleSkip,
    handleClose,
  }
}
