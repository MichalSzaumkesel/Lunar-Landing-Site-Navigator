import { useMemo } from 'react'
import { computeMetrics } from './metrics'
import type { ObserverHeightM, ScenarioMetrics, SiteBundle } from './types'

/**
 * Window metrics (contract section 3) of a scenario, memoised on bundle, height and window.
 * The time cursor is not an input: cursor-dependent values are read separately.
 */
export function useScenarioMetrics(
  bundle: SiteBundle | null,
  heightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): ScenarioMetrics | null {
  return useMemo(
    () => (bundle ? computeMetrics(bundle, { observerHeightM: heightM, startMs, endMs, refMs: startMs }) : null),
    [bundle, heightM, startMs, endMs],
  )
}
