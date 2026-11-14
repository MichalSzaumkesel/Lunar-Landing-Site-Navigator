// Tab recording helper for demo video capture.
// Runs locally in the browser with no external network requests.

export const RECORDING_FILENAME = 'lunar-landing-navigator-demo.webm'

export const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** Probes MediaRecorder for the best supported WebM mime type. */
export function pickMimeType(isSupported?: (mime: string) => boolean): string {
  const probe =
    isSupported ??
    ((mime: string) =>
      typeof MediaRecorder !== 'undefined' &&
      typeof MediaRecorder.isTypeSupported === 'function' &&
      MediaRecorder.isTypeSupported(mime))

  for (const candidate of WEBM_MIME_CANDIDATES) {
    if (probe(candidate)) {
      return candidate
    }
  }
  return 'video/webm'
}

export const RECORDER_ERROR_UNSUPPORTED = 'Screen recording is not supported in this browser.'
export const RECORDER_ERROR_DECLINED =
  'Recording needs permission to capture this tab. Nothing was saved.'

/** Maps errors from getDisplayMedia or MediaRecorder to clear user-facing messages. */
export function getRecorderErrorMessage(err: unknown): string {
  if (err === 'unsupported' || (err instanceof Error && err.message === 'unsupported')) {
    return RECORDER_ERROR_UNSUPPORTED
  }

  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : ''
  const message =
    typeof err === 'object' && err !== null && 'message' in err ? String(err.message) : ''

  if (
    err === 'declined' ||
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    message.toLowerCase().includes('permission') ||
    message.toLowerCase().includes('declined') ||
    message.toLowerCase().includes('denied')
  ) {
    return RECORDER_ERROR_DECLINED
  }
  if (message) {
    return message
  }
  return 'Recording could not be started.'
}

/** Offers a recorded WebM blob for download and revokes the object URL after use. */
export function downloadRecordedBlob(blob: Blob, filename = RECORDING_FILENAME): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1000)
}

export interface RecordingSession {
  stream: MediaStream
  stop(): Promise<Blob | null>
}

/**
 * Prompts user for tab display media and initiates MediaRecorder.
 * Throws with 'unsupported' or 'declined' on expected user or environment boundaries.
 */
export async function startRecordingSession(opts?: {
  onEndedByBrowser?: () => void
}): Promise<RecordingSession> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getDisplayMedia !== 'function' ||
    typeof MediaRecorder === 'undefined'
  ) {
    throw new Error('unsupported')
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      preferCurrentTab: true,
    } as unknown as DisplayMediaStreamOptions)
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
    ) {
      throw new Error('declined')
    }
    throw err
  }

  const mimeType = pickMimeType()
  const recorderOptions: MediaRecorderOptions = {}
  if (
    mimeType &&
    (typeof MediaRecorder.isTypeSupported !== 'function' ||
      MediaRecorder.isTypeSupported(mimeType))
  ) {
    recorderOptions.mimeType = mimeType
  }

  const recorder = new MediaRecorder(stream, recorderOptions)
  const chunks: Blob[] = []

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data)
    }
  }

  const videoTrack = stream.getVideoTracks()[0]
  if (videoTrack && opts?.onEndedByBrowser) {
    videoTrack.addEventListener('ended', opts.onEndedByBrowser, { once: true })
  }

  recorder.start(1000)

  let stopped = false
  const stop = (): Promise<Blob | null> => {
    if (stopped) return Promise.resolve(null)
    stopped = true

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const recordedBlob = new Blob(chunks, { type: mimeType || 'video/webm' })
        resolve(recordedBlob)
      }

      if (recorder.state !== 'inactive') {
        recorder.stop()
      } else {
        stream.getTracks().forEach((track) => track.stop())
        const recordedBlob = new Blob(chunks, { type: mimeType || 'video/webm' })
        resolve(recordedBlob)
      }
    })
  }

  return { stream, stop }
}
