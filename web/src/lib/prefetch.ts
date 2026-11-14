// Prefetches the three fixed demo sites once after first paint.
// This makes "works offline after load" true for the demo sites.
// Note: Other sites load on demand.
import { dataSource } from './loader'
import type { SiteDataSource } from './types'

export const DEMO_SITE_IDS = ['apollo_11', 'artemis_region_1', 'southpole_landed'] as const

let hasPrefetched = false

export function resetPrefetchForTest(): void {
  hasPrefetched = false
}

/**
 * Fetches the demo sites using the existing loader so validation and mock/real choice stay.
 * Runs once after first paint using requestIdleCallback (fallback setTimeout), ignoring errors.
 */
export function prefetchDemoSites(
  siteIds: readonly string[] = DEMO_SITE_IDS,
  source: SiteDataSource = dataSource,
): Promise<void> {
  if (siteIds === DEMO_SITE_IDS && source === dataSource) {
    if (hasPrefetched) {
      return Promise.resolve()
    }
    hasPrefetched = true
  }

  return new Promise<void>((resolve) => {
    const schedule =
      typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1)

    schedule(async () => {
      try {
        await Promise.allSettled(siteIds.map((id) => source.loadSite(id)))
      } catch {
        // Ignore failures
      } finally {
        resolve()
      }
    })
  })
}
