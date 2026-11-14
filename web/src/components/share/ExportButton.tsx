import { useState, type ReactElement } from 'react'
import { useAppStore } from '../../state/store'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { computeMetrics } from '../../lib/metrics'
import { dataSource as defaultDataSource } from '../../lib/loader'
import {
  downloadText,
  scenariosToCsv,
  type ScenarioCsvRow,
} from '../../lib/exportCsv'
import type { SiteDataSource } from '../../lib/types'
import './share.css'

export interface ExportButtonProps {
  className?: string
  disabled?: boolean
  dataSource?: SiteDataSource
}

/** Secondary button that loads all store scenarios, computes metrics, and downloads CSV. */
export function ExportButton({
  className = '',
  disabled = false,
  dataSource = defaultDataSource,
}: ExportButtonProps): ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async (): Promise<void> => {
    if (loading) return
    // Read on click: a subscription would re-render this button on every Play tick.
    const { scenarios, observerHeightM, cursorH } = useAppStore.getState()
    if (!scenarios || scenarios.length === 0) {
      setError('No scenarios to export.')
      return
    }

    setLoading(true)
    setError(null)

    try {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not export CSV: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const tooltip = loading
    ? 'Loading scenario data and computing metrics...'
    : 'Export scenarios and metrics as RFC 4180 CSV'

  return (
    <div className="share-wrap">
      <div className="share-action-row">
        <button
          type="button"
          className={className}
          disabled={disabled || loading}
          title={tooltip}
          onClick={handleExport}
        >
          {loading ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      {error && (
        <span role="alert" className="share-error">
          {error}
        </span>
      )}
    </div>
  )
}
