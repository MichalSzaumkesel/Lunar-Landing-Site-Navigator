import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTour } from './useTour'
import './tour.css'

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

  // Scroll target into view and update position
  useLayoutEffect(() => {
    if (!isOpen || !currentStep) return
    const el = document.querySelector(currentStep.target)
    if (el) {
      el.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    }
    const raf = requestAnimationFrame(() => {
      updatePosition()
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [isOpen, currentStep, updatePosition])

  useEffect(() => {
    if (!isOpen) return

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true })

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  // Focus card dialog (tabindex="-1") only when the tour opens
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      cardRef.current?.focus()
    }
    prevOpenRef.current = isOpen
  }, [isOpen])

  // Keyboard navigation and focus trap
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleClose()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleNext()
    } else if (e.key === 'ArrowLeft') {
      if (canGoBack) {
        e.preventDefault()
        handleBack()
      }
    } else if (e.key === 'Tab') {
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
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (!isOpen || !currentStep) {
    return null
  }

  return (
    <>
      {targetRect && (
        <div
          className="tour-cutout"
          aria-hidden="true"
          style={{
            top: `${targetRect.top - 4}px`,
            left: `${targetRect.left - 4}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-dialog-title"
        aria-describedby="tour-dialog-text"
        tabIndex={-1}
        data-tour-open=""
        className={`tour-card ${className}`.trim()}
        style={{
          top: `${cardPos.top}px`,
          left: `${cardPos.left}px`,
        }}
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
              Skip tour
            </button>
            <div className="tour-card__nav">
              <button type="button" onClick={handleBack} disabled={!canGoBack}>
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
