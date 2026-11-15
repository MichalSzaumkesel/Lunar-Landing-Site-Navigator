import { useEffect, useState } from 'react'
import { computeSlipCell, slipValues, stripKey } from './slipStrip'
import type { SlipCell } from './slipStrip'
import type { MissionRules, ObserverHeightM, SiteBundle } from './types'

const CHUNK = 10
const cache = new Map<string, SlipCell[]>()

export interface SlipStripState {
  cells: SlipCell[]
  done: boolean
}

/**
 * Slip strip cells for one scenario, computed in small timer chunks so the UI stays responsive.
 * Memoised per site, original start, duration, observer height and rules; the slip and the cursor are not inputs.
 */
export function useSlipStrip(
  siteId: string,
  bundle: SiteBundle | null,
  heightM: ObserverHeightM,
  baseStartMs: number,
  durationH: number,
  rules: MissionRules | null,
): SlipStripState {
  const key = stripKey(siteId, baseStartMs, durationH, heightM, rules)
  const [state, setState] = useState<{ key: string; cells: SlipCell[]; done: boolean } | null>(null)

  useEffect(() => {
    if (!bundle || !Number.isFinite(baseStartMs) || !(durationH > 0)) return
    const hit = cache.get(key)
    if (hit) {
      setState({ key, cells: hit, done: true })
      return
    }
    const slips = slipValues()
    const cells: SlipCell[] = []
    let i = 0
    let timer = 0
    let cancelled = false
    setState({ key, cells: [], done: false })
    const step = () => {
      if (cancelled) return
      const end = Math.min(slips.length, i + CHUNK)
      for (; i < end; i++) cells.push(computeSlipCell(bundle, heightM, baseStartMs, durationH, slips[i], rules))
      if (i >= slips.length) {
        cache.set(key, cells)
        if (cache.size > 24) cache.delete(cache.keys().next().value as string)
        setState({ key, cells, done: true })
        return
      }
      setState({ key, cells: cells.slice(), done: false })
      timer = window.setTimeout(step, 0)
    }
    timer = window.setTimeout(step, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // key covers site, start, duration, height and rules.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bundle])

  if (!state || state.key !== key) return { cells: [], done: false }
  return { cells: state.cells, done: state.done }
}
