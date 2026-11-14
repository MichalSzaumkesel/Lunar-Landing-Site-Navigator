import { useMemo } from 'react'
import { listEclipses } from './eclipses'
import type { Eclipse } from './eclipses'
import { ephemCoverage } from './ephem'
import { listSkyEvents } from './events'
import type { SkyEvent } from './events'
import type { ObserverHeightM, SiteBundle } from './types'

export type ScenarioEvents = SkyEvent[] & { eclipses: Eclipse[]; events: SkyEvent[] }

/**
 * Sky events over the whole data coverage, once per bundle and observer height.
 * Also attaches the geometric eclipses (Earth in front of the Sun).
 */
export function useScenarioEvents(
  bundle: SiteBundle | null,
  heightM: ObserverHeightM,
  startMs?: number,
  endMs?: number,
): ScenarioEvents | null {
  return useMemo(() => {
    if (!bundle) return null
    const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(bundle.ephem)
    const list = listSkyEvents(bundle, heightM, covStartMs, covEndMs + 1)
    const s = startMs ?? covStartMs
    const e = endMs ?? (covEndMs + 1)
    const eclipses = listEclipses(bundle.ephem, s, e)
    return Object.assign([...list], {
      events: list,
      eclipses,
    })
  }, [bundle, heightM, startMs, endMs])
}
