import { useMemo } from 'react'
import { MAX_SLIP_DAYS } from '../../config/dataRange'
import { cellTooltip, slipValues, stripSentence } from '../../lib/slipStrip'
import { useSlipStrip } from '../../lib/useSlipStrip'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import type { SiteBundle } from '../../lib/types'
import { viridisRgb } from '../../viz3d/landerHelpers'
import { SwapText } from '../ui/SwapText'
import './scenario.css'

const SLIPS = slipValues()

/** Sun visible by slip, one cell per whole day from -60 to +60; clicking a cell sets the slip. */
export function SlipStrip({ scenario, bundle }: { scenario: Scenario; bundle: SiteBundle | null }) {
  const setSlipDays = useAppStore((s) => s.setSlipDays)
  const heightM = useAppStore((s) => s.observerHeightM)
  const rules = useAppStore((s) => s.missionRules)
  const baseStartMs = Date.parse(scenario.startUtc)
  const { cells, done } = useSlipStrip(scenario.siteId, bundle, heightM, baseStartMs, scenario.durationH, rules)

  const sentence = useMemo(
    () => (done ? stripSentence(cells, scenario.slipDays, true) : 'Computing slips...'),
    [cells, done, scenario.slipDays],
  )
  if (!bundle) return null

  return (
    <div className="slipstrip" data-testid="slip-strip">
      <div
        className="slipstrip__cells"
        role="img"
        aria-label={`Sun visible for slips from -${MAX_SLIP_DAYS} to +${MAX_SLIP_DAYS} days. ${done ? sentence : ''}`}
      >
        {SLIPS.map((slip, i) => {
          const c = cells[i]
          const cls = ['slipstrip__cell']
          let style: { background?: string } | undefined
          if (!c) cls.push('slipstrip__cell--pending')
          else if (!c.hasData || c.sunPct === null) cls.push('slipstrip__cell--nodata')
          else {
            const [r, g, b] = viridisRgb(c.sunPct / 100)
            style = { background: `rgb(${r}, ${g}, ${b})` }
          }
          if (c?.rulesOk) cls.push('slipstrip__cell--ok')
          if (slip === scenario.slipDays) cls.push('slipstrip__cell--current')
          return (
            <span
              key={slip}
              className={cls.join(' ')}
              style={style}
              title={c ? cellTooltip(c) : undefined}
              onClick={() => setSlipDays(scenario.id, slip)}
            />
          )
        })}
      </div>
      <div className="slipstrip__axis" aria-hidden="true">
        <span>-{MAX_SLIP_DAYS}</span>
        <span>0</span>
        <span>+{MAX_SLIP_DAYS}</span>
      </div>
      <p className="slipstrip__note" aria-live="polite">
        <SwapText value={sentence} />
      </p>
      <p className="slipstrip__legend">
        Colour: Sun visible, dark to bright. Dot: mission rules met. Hatched: no data. Click a cell, or use the slider.
      </p>
    </div>
  )
}
