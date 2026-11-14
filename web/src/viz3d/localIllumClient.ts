import type { LocalIllumInput } from './localIllum'
import { localSunlitGrid } from './localIllum'

let currentWorker: Worker | null = null
let currentReject: ((reason?: unknown) => void) | null = null

export function cancelLocalSunlitGrid(): void {
  if (currentReject) {
    const rejectOld = currentReject
    currentReject = null
    rejectOld(new Error('cancelled'))
  }
  if (currentWorker) {
    currentWorker.terminate()
    currentWorker = null
  }
}

export function localSunlitGridAsync(input: LocalIllumInput): Promise<Float32Array> {
  if (typeof Worker === 'undefined') {
    try {
      return Promise.resolve(localSunlitGrid(input))
    } catch (err) {
      return Promise.reject(err)
    }
  }

  cancelLocalSunlitGrid()

  return new Promise<Float32Array>((resolve, reject) => {
    currentReject = reject
    let worker: Worker
    try {
      worker = new Worker(new URL('./localIllum.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch (err) {
      currentReject = null
      reject(err)
      return
    }

    currentWorker = worker

    worker.onmessage = (event: MessageEvent<Float32Array | { error: string }>) => {
      if (currentWorker === worker) {
        currentWorker = null
        currentReject = null
      }
      if ('error' in event.data) {
        reject(new Error(event.data.error))
      } else {
        resolve(event.data)
      }
      worker.terminate()
    }

    worker.onerror = (event: ErrorEvent) => {
      if (currentWorker === worker) {
        currentWorker = null
        currentReject = null
      }
      reject(event.error ?? new Error(event.message || 'Worker error'))
      worker.terminate()
    }

    worker.postMessage(input)
  })
}
