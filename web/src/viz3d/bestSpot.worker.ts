import type { EphemFile } from '../lib/types'
import type { BestSpotResult } from './bestSpot'
import { argmaxBestSpot, buildCellHeightGrid } from './bestSpot'
import { localSunlitGrid } from './localIllum'

export interface BestSpotWorkerRequest {
  heights: Float32Array
  sizePx: number
  spacingM: number
  ephem: EphemFile
  observerHeightM: number
  startMs: number
  endMs: number
  gridN: number
  extentM: number
  radiusM: number
  cachedSunlitGrid?: Float32Array | null
  rays?: number
}

export type BestSpotWorkerMessage =
  | { type: 'progress'; progress: number }
  | {
      type: 'done'
      result: BestSpotResult | null
      sunlitGrid?: Float32Array
    }
  | { type: 'error'; message: string }

interface WorkerGlobal {
  onmessage: ((event: MessageEvent<BestSpotWorkerRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const ctx = self as unknown as WorkerGlobal

ctx.onmessage = (event: MessageEvent<BestSpotWorkerRequest>) => {
  const req = event.data
  try {
    let sunlitGrid: Float32Array
    let isNewlyComputed = false

    if (req.cachedSunlitGrid && req.cachedSunlitGrid.length === req.gridN * req.gridN) {
      sunlitGrid = req.cachedSunlitGrid
      ctx.postMessage({ type: 'progress', progress: 1 })
    } else {
      sunlitGrid = localSunlitGrid({
        heights: req.heights,
        sizePx: req.sizePx,
        spacingM: req.spacingM,
        ephem: req.ephem,
        observerHeightM: req.observerHeightM,
        startMs: req.startMs,
        endMs: req.endMs,
        gridN: req.gridN,
        extentM: req.extentM,
        rays: req.rays ?? 360,
        onProgress: (progress) => {
          ctx.postMessage({ type: 'progress', progress })
        },
      })
      isNewlyComputed = true
    }

    const cellHeightGrid = buildCellHeightGrid(
      req.heights,
      req.sizePx,
      req.spacingM,
      req.gridN,
      req.extentM,
    )

    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid: cellHeightGrid,
      gridN: req.gridN,
      extentM: req.extentM,
      radiusM: req.radiusM,
      sizePx: req.sizePx,
      spacingM: req.spacingM,
      maxSlopeDeg: 10,
    })

    if (isNewlyComputed) {
      ctx.postMessage(
        { type: 'done', result, sunlitGrid },
        [sunlitGrid.buffer],
      )
    } else {
      ctx.postMessage({ type: 'done', result })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.postMessage({ type: 'error', message })
  }
}
