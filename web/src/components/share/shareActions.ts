import { useAppStore } from '../../state/store'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { computeMetrics } from '../../lib/metrics'
import { dataSource as defaultDataSource } from '../../lib/loader'
import { downloadText, scenariosToCsv, type ScenarioCsvRow } from '../../lib/exportCsv'
import type { SiteDataSource } from '../../lib/types'
import { shareUrl } from '../../state/useUrlSync'

/** Copies the shareable URL; resolves to the URL when the clipboard is unavailable, else null. */
export async function copyShareLink(): Promise<string | null> {
  const url = shareUrl()
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(url)
      return null
    } catch {
      // Caller shows the address in a text box instead
    }
  }
  return url
}

/** Loads every store scenario, computes metrics and downloads them as CSV. Throws on failure. */
export async function exportScenariosCsv(
  dataSource: SiteDataSource = defaultDataSource,
): Promise<void> {
  // Read on click: a subscription would re-render this button on every Play tick.
  const { scenarios, observerHeightM, cursorH } = useAppStore.getState()
  if (!scenarios || scenarios.length === 0) {
    throw new Error('No scenarios to export.')
  }

  const bundles = await Promise.all(
    scenarios.map((sc) => dataSource.loadSite(sc.siteId)),
  )

  const rows: ScenarioCsvRow[] = scenarios.map((sc, i) => {
    const bundle = bundles[i]
    const { startMs, endMs } = scenarioWindowMs(sc)
    const refMs = scenarioCursorMs(sc, cursorH)
    const metrics = computeMetrics(bundle, {
      observerHeightM,
      startMs,
      endMs,
      refMs,
    })

    return {
      siteName: bundle.site.name,
      siteId: sc.siteId,
      lat: bundle.site.lat_deg,
      lon: bundle.site.lon_deg,
      startUtc: new Date(startMs).toISOString().replace('.000Z', 'Z'),
      endUtc: new Date(endMs).toISOString().replace('.000Z', 'Z'),
      slipDays: sc.slipDays,
      observerHeightM,
      synthetic: bundle.synthetic,
      approximate: bundle.approximate,
      metrics,
    }
  })

  const csv = scenariosToCsv(rows)
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const filename = `lunar-scenarios-${yyyy}${mm}${dd}.csv`

  downloadText(filename, csv)
}
