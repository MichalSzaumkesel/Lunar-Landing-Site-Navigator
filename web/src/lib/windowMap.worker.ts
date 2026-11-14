import type { MissionRules } from './types'
import {
  computeWindowMap,
  type WindowMapInput,
  type WindowMapRow,
} from './windowMap'

export interface WindowMapWorkerRequest {
  inputs: WindowMapInput[]
  rules: MissionRules
  opts?: { dayStepH?: number; startMs?: number; endMs?: number }
}

interface WorkerScope {
  onmessage: ((event: { data: WindowMapWorkerRequest }) => void) | null
  postMessage: (message: WindowMapRow[], transfer?: Transferable[]) => void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = (event: { data: WindowMapWorkerRequest }) => {
  const { inputs, rules, opts } = event.data
  const rows = computeWindowMap(inputs, rules, opts)

  const transferSet = new Set<Transferable>()
  for (const row of rows) {
    if (row.pctSunlit.buffer instanceof ArrayBuffer) {
      transferSet.add(row.pctSunlit.buffer)
    }
    if (row.pctEarth.buffer instanceof ArrayBuffer) {
      transferSet.add(row.pctEarth.buffer)
    }
    if (row.longestDarkH.buffer instanceof ArrayBuffer) {
      transferSet.add(row.longestDarkH.buffer)
    }
    if (row.valid.buffer instanceof ArrayBuffer) {
      transferSet.add(row.valid.buffer)
    }
  }

  workerScope.postMessage(rows, Array.from(transferSet))
}
