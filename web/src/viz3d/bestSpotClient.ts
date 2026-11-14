import type { BestSpotResult } from './bestSpot'
import { argmaxBestSpot, buildCellHeightGrid } from './bestSpot'
import { localSunlitGrid } from './localIllum'
import type { BestSpotWorkerMessage, BestSpotWorkerRequest } from './bestSpot.worker'

let currentWorker: Worker | null = null
let currentReject: ((reason?: unknown) => void) | null = null

export function cancelBestSpotSearch(): void {
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

export function findBestSpotAsync(
  request: BestSpotWorkerRequest,
  onProgress?: (progress: number) => void,
): Promise<{ result: BestSpotResult | null; sunlitGrid?: Float32Array }> {
  cancelBestSpotSearch()

  if (typeof Worker === 'undefined') {
    let sunlitGrid: Float32Array
    let isNewlyComputed = false

    if (request.cachedSunlitGrid && request.cachedSunlitGrid.length === request.gridN * request.gridN) {
      sunlitGrid = request.cachedSunlitGrid
      onProgress?.(1)
    } else {
      sunlitGrid = localSunlitGrid({
        heights: request.heights,
        sizePx: request.sizePx,
        spacingM: request.spacingM,
        ephem: request.ephem,
        observerHeightM: request.observerHeightM,
        startMs: request.startMs,
        endMs: request.endMs,
        gridN: request.gridN,
        extentM: request.extentM,
        rays: request.rays ?? 360,
        onProgress,
      })
      isNewlyComputed = true
    }

    const cellHeightGrid = buildCellHeightGrid(
      request.heights,
      request.sizePx,
      request.spacingM,
      request.gridN,
      request.extentM,
    )

    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid: cellHeightGrid,
      gridN: request.gridN,
      extentM: request.extentM,
      radiusM: request.radiusM,
      sizePx: request.sizePx,
      spacingM: request.spacingM,
      maxSlopeDeg: 10,
    })

    return Promise.resolve({
      result,
      sunlitGrid: isNewlyComputed ? sunlitGrid : undefined,
    })
  }

  return new Promise((resolve, reject) => {
    currentReject = reject
    let worker: Worker
    try {
      worker = new Worker(new URL('./bestSpot.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch (err) {
      currentReject = null
      reject(err)
      return
    }

    currentWorker = worker

    worker.onmessage = (event: MessageEvent<BestSpotWorkerMessage>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        onProgress?.(msg.progress)
      } else if (msg.type === 'done') {
        if (currentWorker === worker) {
          currentWorker = null
          currentReject = null
        }
        resolve({ result: msg.result, sunlitGrid: msg.sunlitGrid })
        worker.terminate()
      } else if (msg.type === 'error') {
        if (currentWorker === worker) {
          currentWorker = null
          currentReject = null
        }
        reject(new Error(msg.message))
        worker.terminate()
      }
    }

    worker.onerror = (event: ErrorEvent) => {
      if (currentWorker === worker) {
        currentWorker = null
        currentReject = null
      }
      reject(event.error ?? new Error(event.message || 'Worker error'))
      worker.terminate()
    }

    worker.postMessage(request)
  })
}
