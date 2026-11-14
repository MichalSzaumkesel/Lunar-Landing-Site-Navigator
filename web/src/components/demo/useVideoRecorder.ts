import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RECORDING_FILENAME,
  downloadRecordedBlob,
  getRecorderErrorMessage,
  startRecordingSession,
} from '../../lib/recorder'
import type { RecordingSession } from '../../lib/recorder'
import { useDemoStore } from './demoState'

export interface VideoRecorderController {
  isRecording: boolean
  countdown: number | null
  recorderError: string | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  clearError: () => void
}

export function useVideoRecorder(): VideoRecorderController {
  const [isRecording, setIsRecording] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [recorderError, setRecorderError] = useState<string | null>(null)

  const sessionRef = useRef<RecordingSession | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const isRecordingRef = useRef(false)
  const startingRef = useRef(false)

  const isDemoActive = useDemoStore((s) => s.isActive)
  const startDemo = useDemoStore((s) => s.startDemo)
  const stopDemo = useDemoStore((s) => s.stopDemo)

  const finishSession = useCallback(async () => {
    if (countdownTimerRef.current !== null) {
      window.clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setCountdown(null)

    const session = sessionRef.current
    sessionRef.current = null
    const wasRecording = isRecordingRef.current
    isRecordingRef.current = false
    setIsRecording(false)

    if (session) {
      try {
        const blob = await session.stop()
        if (wasRecording && blob && blob.size > 0) {
          downloadRecordedBlob(blob, RECORDING_FILENAME)
        }
      } catch (err) {
        console.error('Failed to finalize recording', err)
      }
    }
  }, [])

  const stopRecording = useCallback(async () => {
    stopDemo()
    await finishSession()
  }, [stopDemo, finishSession])

  // Stop recording when demo mode ends (e.g. video script finished, Esc pressed)
  useEffect(() => {
    if (!isDemoActive && (isRecordingRef.current || countdownTimerRef.current !== null)) {
      finishSession()
    }
  }, [isDemoActive, finishSession])

  // Escape listener during countdown before demo becomes active
  useEffect(() => {
    if (countdown === null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        stopRecording()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [countdown, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearTimeout(countdownTimerRef.current)
        countdownTimerRef.current = null
      }
      const session = sessionRef.current
      if (session) {
        sessionRef.current = null
        session.stop()
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    if (startingRef.current || isRecordingRef.current || countdownTimerRef.current !== null) {
      return
    }
    startingRef.current = true
    setRecorderError(null)

    let session: RecordingSession
    try {
      session = await startRecordingSession({
        onEndedByBrowser: () => {
          stopRecording()
        },
      })
    } catch (err: unknown) {
      const msg = getRecorderErrorMessage(err)
      setRecorderError(msg)
      return
    } finally {
      startingRef.current = false
    }

    sessionRef.current = session

    // 3 second countdown before starting video script
    setCountdown(3)

    countdownTimerRef.current = window.setTimeout(() => {
      setCountdown(2)
      countdownTimerRef.current = window.setTimeout(() => {
        setCountdown(1)
        countdownTimerRef.current = window.setTimeout(() => {
          setCountdown(null)
          countdownTimerRef.current = null
          // Start actual media recording only after countdown finishes
          session.startCapture()
          isRecordingRef.current = true
          setIsRecording(true)
          // Start the 30 second video script
          startDemo('video30s')
        }, 1000)
      }, 1000)
    }, 1000)
  }, [startDemo, stopRecording])

  const clearError = useCallback(() => {
    setRecorderError(null)
  }, [])

  return {
    isRecording,
    countdown,
    recorderError,
    startRecording,
    stopRecording,
    clearError,
  }
}
