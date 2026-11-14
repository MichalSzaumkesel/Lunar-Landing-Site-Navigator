import { useEffect, useState, type ReactElement } from 'react'
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
  const [isPolarActive, setIsPolarActive] = useState(true)

  useEffect(() => {
    if (typeof document === 'undefined') return

    // Tab ids come from useId(), so detect the Polar view by its mounted frame (Panorama uses .sky__pano).
    const checkPolar = () => {
      const hasTabs = document.querySelector('[role="tab"][id$="-tab-polar"]') !== null
      const hasPolar =
        document.querySelector(`.sky__frame svg.sky__svg[data-scenario="${scenario.id}"]`) !== null
      setIsPolarActive(!hasTabs || hasPolar)
    }

    checkPolar()

    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(checkPolar)
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: ['aria-selected'],
      })
      return () => observer.disconnect()
    }
  }, [scenario.id])

  const handleExport = async (): Promise<void> => {
    if (loading || !isPolarActive) return
    setLoading(true)
    setError(null)

    try {
      // Find the card's sky plot SVG element in the DOM
      const svgElement =
        typeof document !== 'undefined'
          ? document.querySelector<SVGSVGElement>(
              `.sky__frame svg.sky__svg[data-scenario="${scenario.id}"]`,
            )
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

  const isButtonDisabled = disabled || loading || !isPolarActive
  const tooltip = !isPolarActive
    ? 'Switch to the Polar view to save the card'
    : loading
      ? 'Rendering scenario card to PNG…'
      : 'Save card view, sky plot, and key metrics as a 1600x900 PNG image'

  return (
    <div className="share-wrap">
      <button
        type="button"
        className={`ghost ${className}`.trim()}
        disabled={isButtonDisabled}
        onClick={handleExport}
        title={tooltip}
        aria-label={`Save card as PNG for ${siteName}`}
        aria-busy={loading}
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
