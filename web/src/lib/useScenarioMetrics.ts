import { useMemo } from 'react'
import { computeMetrics } from './metrics'
import { horizonShareRange } from './horizonUncertainty'
import type { HorizonShareRange } from './horizonUncertainty'
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

/** Metrics of the same window at slip 0; null when the scenario is not slipped. Only computed on demand. */
export function useOriginalMetrics(
  bundle: SiteBundle | null,
  heightM: ObserverHeightM,
  startMs: number,
  endMs: number,
  slipDays: number,
): ScenarioMetrics | null {
  return useMemo(() => {
    if (!bundle || slipDays === 0) return null
    const shift = slipDays * 86_400_000
    return computeMetrics(bundle, {
      observerHeightM: heightM,
      startMs: startMs - shift,
      endMs: endMs - shift,
      refMs: startMs - shift,
    })
  }, [bundle, heightM, startMs, endMs, slipDays])
}

/**
 * Sun visible / Earth in view range for the horizon raised and lowered by its `uncertainty_deg`.
 * Null when the horizon file carries none. Memoised per bundle, height and window; the cursor is not an input.
 */
export function useHorizonShareRange(
  bundle: SiteBundle | null,
  heightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): HorizonShareRange | null {
  return useMemo(() => (bundle ? horizonShareRange(bundle, heightM, startMs, endMs) : null), [bundle, heightM, startMs, endMs])
}
