import { useEffect, useMemo, useState } from 'react'
import { ephemCoverage } from '../../lib/ephem'
import { listSkyEvents } from '../../lib/events'
import type { SkyEvent } from '../../lib/events'
import { dataSource } from '../../lib/loader'
import { computeMetrics } from '../../lib/metrics'
import type { SiteBundle } from '../../lib/types'
import { scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { DemoStepContext } from './demoSteps'

/**
 * Gathers scenario bundles, metrics, and events for demo step execution and narration.
 */
export function useDemoContext(): DemoStepContext {
  const scenarios = useAppStore((s) => s.scenarios)
  const heightM = useAppStore((s) => s.observerHeightM)
  const [bundles, setBundles] = useState<(SiteBundle | null)[]>([])

  useEffect(() => {
    let cancelled = false
    const promises = scenarios.map((s) => dataSource.loadSite(s.siteId).catch(() => null))

    Promise.all(promises).then((loaded) => {
      if (!cancelled) {
        setBundles(loaded)
      }
    })

    return () => {
      cancelled = true
    }
  }, [scenarios])

  const metrics = useMemo(() => {
    return scenarios.map((scenario, i) => {
      const bundle = bundles[i]
      if (!bundle) return null
      const { startMs, endMs } = scenarioWindowMs(scenario)
      return computeMetrics(bundle, {
        observerHeightM: heightM,
        startMs,
        endMs,
        refMs: startMs,
      })
    })
  }, [scenarios, bundles, heightM])

  const events = useMemo(() => {
    return bundles.map((bundle) => {
      if (!bundle) return null
      const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(bundle.ephem)
      return listSkyEvents(bundle, heightM, covStartMs, covEndMs + 1)
    })
  }, [bundles, heightM]) as (SkyEvent[] | null)[]

  const isSynthetic = useMemo(() => {
    return bundles.some((b) => b?.synthetic || b?.provenance === 'mock')
  }, [bundles])

  return {
    scenarios,
    bundles,
    metrics,
    events,
    isSynthetic,
  }
}
