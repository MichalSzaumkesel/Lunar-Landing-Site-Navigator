import { useState, type ReactElement } from 'react'
import { exportCardAsPng, type CardExportData } from '../../lib/exportPng'
import type { ScenarioMetrics, SiteBundle } from '../../lib/types'
import { scenarioWindowMs } from '../../state/selectors'
import type { Scenario } from '../../state/types'
import './share.css'

export interface ExportCardPngButtonProps {
  scenario: Scenario
  siteName: string
  bundle: SiteBundle | null
  metrics: ScenarioMetrics | null
  className?: string
  disabled?: boolean
}

/**
 * Secondary card action that renders the scenario card to an offscreen
 * 1600x900 canvas and triggers a PNG download.
 */
export function ExportCardPngButton({
  scenario,
  siteName,
  bundle,
  metrics,
  className = '',
  disabled = false,
}: ExportCardPngButtonProps): ReactElement {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExport = async (): Promise<void> => {
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      // Find the card's sky plot SVG element in the DOM
      const svgElement =
        typeof document !== 'undefined'
          ? document.querySelector<SVGSVGElement>(`svg.sky__svg[data-scenario="${scenario.id}"]`)
          : null

      const { startMs, endMs } = scenarioWindowMs(scenario)

      const data: CardExportData = {
        siteName,
        siteId: scenario.siteId,
        startUtc: new Date(startMs).toISOString().replace('.000Z', 'Z'),
        endUtc: new Date(endMs).toISOString().replace('.000Z', 'Z'),
        synthetic: bundle?.synthetic ?? false,
        approximate: bundle?.approximate ?? false,
        metrics,
        svgElement,
      }

      await exportCardAsPng(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Could not save PNG: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const tooltip = loading
    ? 'Rendering scenario card to PNG…'
    : 'Save card view, sky plot, and key metrics as a 1600x900 PNG image'

  return (
    <div className="share-wrap">
      <button
        type="button"
        className={`ghost ${className}`.trim()}
        disabled={disabled || loading}
        onClick={handleExport}
        title={tooltip}
        aria-label={`Save card as PNG for ${siteName}`}
      >
        {loading ? 'Saving PNG…' : 'Save card as PNG'}
      </button>
      {error && (
        <span role="alert" className="share-error">
          {error}
        </span>
      )}
    </div>
  )
}
