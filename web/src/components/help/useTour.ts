import { useCallback, useEffect } from 'react'
import { useAppStore } from '../../state/store'
import {
  advancedSteps,
  nextAvailableStep,
  shouldAutoStart,
  simpleSteps,
  type TourStep,
} from './tourSteps'
import {
  getStoredTourStatus,
  setStoredTourStatus,
  useTourStore,
} from './tourState'

export function useTour() {
  const mode = useAppStore((s) => s.mode)
  const isOpen = useTourStore((s) => s.isOpen)
  const stepIndex = useTourStore((s) => s.stepIndex)
  const dontShowAgain = useTourStore((s) => s.dontShowAgain)
  const openTour = useTourStore((s) => s.openTour)
  const closeTour = useTourStore((s) => s.closeTour)
  const setStepIndex = useTourStore((s) => s.setStepIndex)
  const setDontShowAgain = useTourStore((s) => s.setDontShowAgain)

  const steps: TourStep[] = mode === 'simple' ? simpleSteps : advancedSteps

  const exists = useCallback((selector: string) => {
    return typeof document !== 'undefined' && Boolean(document.querySelector(selector))
  }, [])

  // Auto-start on first visit of each level
  useEffect(() => {
    // Switching level closes an open tour
    if (useTourStore.getState().isOpen) {
      closeTour()
    }

    if (typeof window === 'undefined') return

    const urlParams = new URLSearchParams(window.location.search)
    const suppressed = urlParams.get('tour') === '0'
    const stored = getStoredTourStatus(mode)

    if (!shouldAutoStart(stored, suppressed)) {
      return
    }

    const timer = setTimeout(() => {
      // Find first available step
      const firstAvailable = nextAvailableStep(steps, -1, 1, exists)
      if (firstAvailable !== -1) {
        openTour(firstAvailable)
      } else {
        openTour(0)
      }
    }, 600)

    return () => {
      clearTimeout(timer)
    }
  }, [mode, exists, openTour, closeTour, steps])

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

  const returnFocus = useCallback(() => {
    if (typeof document === 'undefined') return
    const prev = useTourStore.getState().previousFocus
    if (prev && document.contains(prev)) {
      prev.focus()
    } else {
      const btn = document.querySelector<HTMLElement>('[data-tour="help-button"]')
      btn?.focus()
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
