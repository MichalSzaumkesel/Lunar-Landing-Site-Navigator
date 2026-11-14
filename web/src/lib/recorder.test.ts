// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECORDING_FILENAME,
  RECORDER_ERROR_DECLINED,
  RECORDER_ERROR_UNSUPPORTED,
  downloadRecordedBlob,
  getRecorderErrorMessage,
  pickMimeType,
  startRecordingSession,
} from './recorder'

describe('recorder module', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('RECORDING_FILENAME', () => {
    it('is exactly lunar-landing-navigator-demo.webm', () => {
      expect(RECORDING_FILENAME).toBe('lunar-landing-navigator-demo.webm')
    })
  })

  describe('pickMimeType', () => {
    it('picks the first supported candidate when VP9 is supported', () => {
      const isTypeSupported = vi.fn((mime: string) => mime.includes('vp9,opus'))
      const result = pickMimeType(isTypeSupported)
      expect(result).toBe('video/webm;codecs=vp9,opus')
    })

    it('falls back to VP8 when VP9 is unsupported', () => {
      const isTypeSupported = vi.fn((mime: string) => mime === 'video/webm;codecs=vp8')
      const result = pickMimeType(isTypeSupported)
      expect(result).toBe('video/webm;codecs=vp8')
    })

    it('falls back to video/webm when candidates are unsupported', () => {
      const isTypeSupported = vi.fn(() => false)
      const result = pickMimeType(isTypeSupported)
      expect(result).toBe('video/webm')
    })

    it('uses global MediaRecorder.isTypeSupported if probe parameter is omitted', () => {
      vi.stubGlobal('MediaRecorder', {
        isTypeSupported: vi.fn((mime: string) => mime === 'video/webm;codecs=vp9'),
      })
      const result = pickMimeType()
      expect(result).toBe('video/webm;codecs=vp9')
    })
  })

  describe('getRecorderErrorMessage', () => {
    it('maps unsupported string and Error to clear unsupported message', () => {
      expect(getRecorderErrorMessage('unsupported')).toBe(RECORDER_ERROR_UNSUPPORTED)
      expect(getRecorderErrorMessage(new Error('unsupported'))).toBe(RECORDER_ERROR_UNSUPPORTED)
    })

    it('maps declined string, NotAllowedError, and permission denied to exact specification text', () => {
      const expected = RECORDER_ERROR_DECLINED
      expect(getRecorderErrorMessage('declined')).toBe(expected)

      const notAllowedErr = new DOMException('Permission denied', 'NotAllowedError')
      expect(getRecorderErrorMessage(notAllowedErr)).toBe(expected)

      const permDeniedErr = new DOMException('Permission denied', 'PermissionDeniedError')
      expect(getRecorderErrorMessage(permDeniedErr)).toBe(expected)

      const customMsgErr = new Error('User declined screen sharing')
      expect(getRecorderErrorMessage(customMsgErr)).toBe(expected)
    })

    it('preserves generic error messages', () => {
      expect(getRecorderErrorMessage(new Error('Track failed'))).toBe('Track failed')
    })
  })

  describe('downloadRecordedBlob', () => {
    it('creates object URL, triggers anchor click, and revokes URL after timeout', () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
      const mockRevokeObjectURL = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectURL,
        revokeObjectURL: mockRevokeObjectURL,
      })

      const appendChildSpy = vi.spyOn(document.body, 'appendChild')
      const clickSpy = vi.fn()
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = originalCreateElement(tagName)
        if (tagName === 'a') {
          el.click = clickSpy
        }
        return el
      })

      const blob = new Blob(['mock video content'], { type: 'video/webm' })
      downloadRecordedBlob(blob)

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)
      expect(appendChildSpy).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()

      // Before timer advances, revokeObjectURL is not yet called
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()

      vi.advanceTimersByTime(10500)
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })
  })

  describe('startRecordingSession', () => {
    it('stops stream tracks and resolves null when stopped before startCapture', async () => {
      const mockStopTrack = vi.fn()
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: mockStopTrack }]),
        getVideoTracks: vi.fn(() => [{ addEventListener: vi.fn() }]),
      } as unknown as MediaStream

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
        },
      })

      const mockStart = vi.fn()
      const mockStop = vi.fn()
      class MockMediaRecorder {
        state = 'inactive'
        ondataavailable = null
        onstop: (() => void) | null = null
        start = mockStart
        stop = mockStop
        static isTypeSupported = vi.fn(() => true)
      }
      vi.stubGlobal('MediaRecorder', MockMediaRecorder)

      const session = await startRecordingSession()
      expect(mockStart).not.toHaveBeenCalled()

      // Stop before capture started
      const blob = await session.stop()
      expect(blob).toBeNull()
      expect(mockStopTrack).toHaveBeenCalled()
    })

    it('stops stream tracks if MediaRecorder constructor throws', async () => {
      const mockStopTrack = vi.fn()
      const mockStream = {
        getTracks: vi.fn(() => [{ stop: mockStopTrack }]),
        getVideoTracks: vi.fn(() => []),
      } as unknown as MediaStream

      vi.stubGlobal('navigator', {
        mediaDevices: {
          getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
        },
      })

      class ThrowingMediaRecorder {
        constructor() {
          throw new Error('Unsupported mimeType')
        }
      }
      vi.stubGlobal('MediaRecorder', ThrowingMediaRecorder)

      await expect(startRecordingSession()).rejects.toThrow('Unsupported mimeType')
      expect(mockStopTrack).toHaveBeenCalled()
    })
  })
})
