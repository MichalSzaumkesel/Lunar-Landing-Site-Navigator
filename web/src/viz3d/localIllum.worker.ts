import type { LocalIllumInput } from './localIllum'
import { localSunlitGrid } from './localIllum'

interface WorkerGlobal {
  onmessage: ((event: MessageEvent<LocalIllumInput>) => void) | null
  postMessage(message: unknown, transfer: Transferable[]): void
}

const ctx = self as unknown as WorkerGlobal

ctx.onmessage = (event: MessageEvent<LocalIllumInput>) => {
  const result = localSunlitGrid(event.data)
  ctx.postMessage(result, [result.buffer])
}
