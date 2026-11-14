import type { MissionRules } from './types'
import {
  computeWindowMap,
  type WindowMapInput,
  type WindowMapRow,
} from './windowMap'

let activeWorker: Worker | null = null
let activeReject: ((reason?: unknown) => void) | null = null

export function cancelWindowMap(): void {
  if (activeWorker !== null) {
    activeWorker.terminate()
    activeWorker = null
    if (activeReject !== null) {
      activeReject(new Error('cancelled'))
      activeReject = null
    }
  }
}

export function computeWindowMapAsync(
  inputs: WindowMapInput[],
  rules: MissionRules,
  opts?: { dayStepH?: number; startMs?: number; endMs?: number }
): Promise<WindowMapRow[]> {
  if (activeWorker !== null) {
    activeWorker.terminate()
    activeWorker = null
    if (activeReject !== null) {
      activeReject(new Error('cancelled'))
      activeReject = null
    }
  }

  if (typeof Worker === 'undefined') {
    try {
      return Promise.resolve(computeWindowMap(inputs, rules, opts))
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise<WindowMapRow[]>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./windowMap.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch (err) {
      reject(err)
      return
    }

    activeWorker = worker
    activeReject = reject

    worker.onmessage = (event: MessageEvent<WindowMapRow[]>) => {
      if (activeWorker === worker) {
        activeWorker = null
        activeReject = null
      }
      worker.terminate()
      resolve(event.data)
    }

    worker.onerror = (event: ErrorEvent) => {
      if (activeWorker === worker) {
        activeWorker = null
        activeReject = null
      }
      worker.terminate()
      event.preventDefault?.()
      const error = event.error ?? new Error(event.message || 'Worker error')
      reject(error)
    }

    worker.postMessage({ inputs, rules, opts })
  })
}
