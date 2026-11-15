import { useEffect, useRef } from 'react'
import { useDemo } from './useDemo'
import { useVideoRecorder } from './useVideoRecorder'
import './demo.css'

export function DemoCaption() {
  const { isActive, variant, caption, atEnd, restartDemo, stopDemo, setVariant } = useDemo()
  const { isRecording, countdown, recorderError, startRecording, stopRecording, clearError } =
    useVideoRecorder()
  const stopButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isRecording) {
      stopButtonRef.current?.focus({ preventScroll: true })
    }
  }, [isRecording])

  if (!isActive && !isRecording && countdown === null && !recorderError) {
    return null
  }

  const handleToggleVariant = () => {
    if (variant === 'video30s') {
      setVariant('normal')
    } else {
      setVariant('video30s')
    }
  }

  const handleStopAll = () => {
    clearError()
    if (isRecording || countdown !== null) {
      stopRecording()
    } else {
      stopDemo()
    }
  }

  const badgeText = isRecording
    ? 'REC 30 s'
    : variant === 'video30s'
      ? 'Video 30 s'
      : 'Demo'

  let displayedText = caption
  if (countdown !== null) {
    displayedText = `Recording starts in ${countdown}...`
  } else if (recorderError) {
    displayedText = recorderError
  }

  return (
    <aside
      className={`demo-caption ${isRecording ? 'demo-caption--recording' : ''}`}
      role="region"
      aria-label="Demo narration"
    >
      <div className="demo-caption__content">
        <span
          className={`demo-caption__badge ${
            isRecording
              ? 'demo-caption__badge--recording'
              : variant === 'video30s'
                ? 'demo-caption__badge--video'
                : ''
          }`}
        >
          {badgeText}
        </span>
        <p className="demo-caption__text" aria-live="polite" aria-atomic="true">
          {displayedText}
        </p>
      </div>
      <div className="demo-caption__controls">
        {/* Recorder UI is hidden during recording so it does not appear in recorded frame */}
        {!isRecording && (
          <div className="demo-caption__actions" data-recorder-ui="true">
            <button
              type="button"
              className="demo-caption__btn"
              aria-pressed={variant === 'video30s'}
              onClick={handleToggleVariant}
              title="Switch between standard demo and 30 s timed video script"
              aria-label="Video 30 s variant"
            >
              {variant === 'video30s' ? 'Standard demo' : 'Video 30 s'}
            </button>
            <button
              type="button"
              className="demo-caption__btn demo-caption__btn--record"
              onClick={startRecording}
              disabled={countdown !== null}
              title="Record a 30 second demo video (WebM download)"
              aria-label="Record video"
            >
              Record video
            </button>
          </div>
        )}
        {recorderError && (
          <button
            type="button"
            className="demo-caption__btn"
            onClick={clearError}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        )}
        {atEnd && !isRecording && (
          <button type="button" className="demo-caption__btn" onClick={restartDemo} aria-label="Restart demo">
            Restart
          </button>
        )}
        <span className="demo-caption__hint">Esc to stop</span>
        <button
          ref={stopButtonRef}
          type="button"
          className="demo-caption__stop"
          onClick={handleStopAll}
          aria-label="Stop demo"
        >
          Stop demo
        </button>
      </div>
    </aside>
  )
}
