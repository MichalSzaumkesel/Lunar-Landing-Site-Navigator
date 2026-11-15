import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MOTION_EASE, MOTION_MS, prefersReducedMotion } from '../../lib/motion'
import { isFullyInView, scrollIntoUsableView, whenScrollSettled } from './scrollSettle'
import { describeKeyTarget, tourKeyAction } from './tourKeys'
import { useTour } from './useTour'
import { sectionsForTarget } from '../../lib/disclosure'
import './tour.css'

// A collapsed section expands with an animation; the step measures its target after it ends.
const SECTION_OPEN_MS = MOTION_MS.normal + 20
const FADE_OUT_MS = MOTION_MS.fast
const SPOTLIGHT_PAD = 4
const reducedMotion = prefersReducedMotion

export interface TourProps {
  className?: string
}

export function Tour({ className = '' }: TourProps) {
  const {
    isOpen,
    stepIndex,
    currentStep,
    totalSteps,
    dontShowAgain,
    setDontShowAgain,
    isLastStep,
    canGoBack,
    handleNext,
    handleBack,
    handleSkip,
    handleClose,
  } = useTour()

  const cardRef = useRef<HTMLDivElement | null>(null)
  const nextBtnRef = useRef<HTMLButtonElement | null>(null)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [readyIndex, setReadyIndex] = useState(-1)
  const ready = isOpen && readyIndex === stepIndex
  const settledRef = useRef(false)
  const cutoutRef = useRef<HTMLDivElement | null>(null)
  const shownRect = useRef<DOMRect | null>(null)
  const shownStep = useRef(-1)
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 100, left: 100 })

  // Measure and position the popover card and cutout
  const updatePosition = useCallback(() => {
    if (!isOpen || !currentStep) return
    const el = document.querySelector(currentStep.target)
    if (!el) {
      setTargetRect(null)
      return
    }

    const rect = el.getBoundingClientRect()
    setTargetRect(rect)

    const card = cardRef.current
    const cardW = card?.offsetWidth ?? 340
    const cardH = card?.offsetHeight ?? 220
    const pad = 16
    const margin = 12

    let top = rect.bottom + margin
    let left = rect.left + (rect.width - cardW) / 2

    const placement = currentStep.placement ?? 'bottom'
    if (placement === 'bottom') {
      top = rect.bottom + margin
      left = rect.left + (rect.width - cardW) / 2
      // If overflowing bottom, try top
      if (top + cardH > window.innerHeight - pad && rect.top - cardH - margin >= pad) {
        top = rect.top - cardH - margin
      }
    } else if (placement === 'top') {
      top = rect.top - cardH - margin
      left = rect.left + (rect.width - cardW) / 2
      // If overflowing top, try bottom
      if (top < pad && rect.bottom + margin + cardH <= window.innerHeight - pad) {
        top = rect.bottom + margin
      }
    } else if (placement === 'right') {
      top = rect.top + (rect.height - cardH) / 2
      left = rect.right + margin
      // If overflowing right, try left
      if (left + cardW > window.innerWidth - pad && rect.left - cardW - margin >= pad) {
        left = rect.left - cardW - margin
      }
    } else if (placement === 'left') {
      top = rect.top + (rect.height - cardH) / 2
      left = rect.left - cardW - margin
      // If overflowing left, try right
      if (left < pad && rect.right + margin + cardW <= window.innerWidth - pad) {
        left = rect.right + margin
      }
    }

    // Clamp inside viewport
    left = Math.max(pad, Math.min(window.innerWidth - cardW - pad, left))
    top = Math.max(pad, Math.min(window.innerHeight - cardH - pad, top))

    setCardPos({ top, left })
  }, [isOpen, currentStep])

  // Step change: fade out, scroll with the overlay untouched, then place once and fade in
  useEffect(() => {
    if (!isOpen || !currentStep) return
    settledRef.current = false
    let cancelWait = () => {}
    let restoreMargins = () => {}
    const settle = () => {
      updatePosition()
      settledRef.current = true
      setReadyIndex(stepIndex)
    }
    const timer = window.setTimeout(() => {
      const el = document.querySelector(currentStep.target)
      const reduce = reducedMotion()
      if (!el || isFullyInView(el)) {
        settle()
        return
      }
      restoreMargins = scrollIntoUsableView(el, reduce ? 'auto' : 'smooth')
      if (reduce) settle()
      else cancelWait = whenScrollSettled(el, settle)
    }, reducedMotion() ? 0 : FADE_OUT_MS + (sectionsForTarget(currentStep.target).length > 0 ? SECTION_OPEN_MS : 0))
    return () => {
      clearTimeout(timer)
      cancelWait()
      restoreMargins()
    }
  }, [isOpen, currentStep, stepIndex, updatePosition])

  // After the step settled, follow manual scroll and resize (throttled to one update per frame)
  useEffect(() => {
    if (!isOpen) return
    let raf = 0
    const onChange = () => {
      if (!settledRef.current || raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        updatePosition()
      })
    }
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [isOpen, updatePosition])

  // Spotlight glide between steps: FLIP from the rect it showed to the new one, transform only.
  // Scroll and resize updates inside one step move it directly.
  useLayoutEffect(() => {
    if (!isOpen) {
      shownRect.current = null
      shownStep.current = -1
      return
    }
    const el = cutoutRef.current
    if (!el || !targetRect) return
    const prev = shownRect.current
    // Step changed but nothing measured yet: the spotlight still shows the old rect
    if (prev === targetRect) return
    const stepChanged = shownStep.current !== stepIndex
    shownRect.current = targetRect
    shownStep.current = stepIndex
    if (!prev || !stepChanged || reducedMotion() || typeof el.animate !== 'function') return
    const w = targetRect.width + SPOTLIGHT_PAD * 2
    const h = targetRect.height + SPOTLIGHT_PAD * 2
    if (w <= 0 || h <= 0) return
    const clamp = (v: number) => Math.min(5, Math.max(0.2, v))
    const sx = clamp((prev.width + SPOTLIGHT_PAD * 2) / w)
    const sy = clamp((prev.height + SPOTLIGHT_PAD * 2) / h)
    const from = `translate(${prev.left - SPOTLIGHT_PAD}px, ${prev.top - SPOTLIGHT_PAD}px) scale(${sx}, ${sy})`
    const to = `translate(${targetRect.left - SPOTLIGHT_PAD}px, ${targetRect.top - SPOTLIGHT_PAD}px)`
    el.animate([{ transform: from }, { transform: to }], { duration: MOTION_MS.normal, easing: MOTION_EASE.inOut })
  }, [isOpen, targetRect, stepIndex])

  // Focus card dialog (tabindex="-1") only when the tour opens
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      cardRef.current?.focus({ preventScroll: true })
    }
    prevOpenRef.current = isOpen
  }, [isOpen])

  // Escape and the arrows work wherever focus is while the tour is open (for example after a click on the
  // page or when the focused Back button became inactive). Capture phase: the page shortcuts must not also move time.
  const keysRef = useRef({ handleClose, handleNext, handleBack, canGoBack })
  keysRef.current = { handleClose, handleNext, handleBack, canGoBack }
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      const action = tourKeyAction({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
        canGoBack: keysRef.current.canGoBack,
        ...describeKeyTarget(e.target, cardRef.current),
      })
      if (!action) return
      e.preventDefault()
      if (action === 'close') keysRef.current.handleClose()
      else if (action === 'next') keysRef.current.handleNext()
      else keysRef.current.handleBack()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [isOpen])

  // Focus trap inside the card
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const card = cardRef.current
      if (!card) return
      const focusable = card.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
  }

  if (!isOpen || !currentStep) {
    return null
  }

  return (
    <>
      {/* One persistent dimming layer: the shadow of the spotlight frame. It never fades between steps. */}
      <div
        ref={cutoutRef}
        className={`tour-cutout${ready && targetRect ? ' tour-cutout--on' : ''}`}
        data-testid="tour-spotlight"
        aria-hidden="true"
        style={
          targetRect
            ? {
                transform: `translate(${targetRect.left - SPOTLIGHT_PAD}px, ${targetRect.top - SPOTLIGHT_PAD}px)`,
                width: `${targetRect.width + SPOTLIGHT_PAD * 2}px`,
                height: `${targetRect.height + SPOTLIGHT_PAD * 2}px`,
              }
            : { transform: 'translate(50vw, 50vh)', width: '0px', height: '0px' }
        }
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-dialog-title"
        aria-describedby="tour-dialog-text"
        tabIndex={-1}
        data-tour-open=""
        className={`tour-card${ready ? ' tour-card--on' : ''} ${className}`.trim()}
        style={{ transform: `translate(${cardPos.left}px, ${cardPos.top}px)` }}
        onKeyDown={handleKeyDown}
      >
        <div className="tour-sr-only" aria-live="polite" aria-atomic="true">
          {`Step ${stepIndex + 1} of ${totalSteps}: ${currentStep.title}`}
        </div>

        <div className="tour-card__header">
          <h3 id="tour-dialog-title" className="tour-card__title">
            {currentStep.title}
          </h3>
          <span className="tour-card__step">
            Step {stepIndex + 1} of {totalSteps}
          </span>
        </div>

        <p id="tour-dialog-text" className="tour-card__text">
          {currentStep.text}
        </p>

        <div className="tour-card__footer">
          <label className="tour-card__checkbox">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            Don't show this again
          </label>

          <div className="tour-card__actions">
            <button type="button" className="ghost" onClick={handleSkip}>
              Skip tutorial
            </button>
            <div className="tour-card__nav">
              <button
                type="button"
                onClick={() => {
                  if (canGoBack) handleBack()
                }}
                aria-disabled={!canGoBack}
              >
                Back
              </button>
              <button
                type="button"
                ref={nextBtnRef}
                className="primary"
                onClick={handleNext}
              >
                {isLastStep ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
