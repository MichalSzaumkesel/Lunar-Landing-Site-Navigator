import { dataSource } from '../../lib/loader'
import type { Site } from '../../lib/types'

/** Curated sites, loaded once and shared by every card. */
let sitesPromise: Promise<Site[]> | null = null
export function loadCuratedSites(): Promise<Site[]> {
  sitesPromise ??= dataSource
    .loadSites()
    .then((f) => f.sites.filter((s) => s.category !== 'custom'))
    .catch(() => {
      sitesPromise = null
      return []
    })
  return sitesPromise
}
