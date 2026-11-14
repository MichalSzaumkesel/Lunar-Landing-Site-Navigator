import { useState, type ReactElement } from 'react'
import { usePresenceValue } from '../../lib/usePresence'
import type { SiteDataSource } from '../../lib/types'
import { dataSource as defaultDataSource } from '../../lib/loader'
import { exportScenariosCsv } from './shareActions'
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
  const errorP = usePresenceValue(error)
  const errorP = usePresenceValue(error)

  const handleExport = async (): Promise<void> => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await exportScenariosCsv(dataSource)
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
      {errorP.mounted && (
        <span role="alert" className="share-error presence-rise" data-state={errorP.state}>
          {errorP.value}
        </span>
      )}
    </div>
  )
}
