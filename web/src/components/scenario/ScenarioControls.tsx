import { useId } from 'react'
import type { ChangeEvent } from 'react'
import { MAX_SLIP_DAYS } from '../../config/dataRange'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { clampStartUtc, dateInputBounds, durationOptionsH, formatChange, formatSlip } from './cardLogic'
import type { SlipChange } from './cardLogic'
import './scenario.css'

const SLIP_TIP =
  'Shifts the window start by whole days to test a later or earlier landing date. The date field keeps the original start.'

function humanSlip(days: number): string {
  if (days === 0) return '0 days (no slip)'
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} later`
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} earlier`
}

export function ScenarioControls({
  scenario,
  siteName,
  change = null,
}: {
  scenario: Scenario
  siteName?: string
  /** Change versus slip 0, shown as one line under the fields. */
  change?: SlipChange | null
}) {
  const updateScenario = useAppStore((s) => s.updateScenario)
  const setSlipDays = useAppStore((s) => s.setSlipDays)
  const id = useId()
  const { min, max } = dateInputBounds(scenario.durationH)

  const onDate = (e: ChangeEvent<HTMLInputElement>) => {
    const startUtc = clampStartUtc(e.target.value, scenario.durationH)
    if (startUtc) updateScenario(scenario.id, { startUtc })
  }

  const onDuration = (e: ChangeEvent<HTMLSelectElement>) => {
    const durationH = Number(e.target.value)
    // The start is clamped again so the longer window stays inside the data coverage.
    const day = scenario.startUtc.slice(0, 10)
    updateScenario(scenario.id, { durationH, startUtc: clampStartUtc(day, durationH) ?? scenario.startUtc })
  }

  return (
    <div className="controls" data-tour="scenario-controls">
      <div className="controls__field">
        <label htmlFor={`${id}-start`}>Window start (UTC)</label>
        <input
          id={`${id}-start`}
          type="date"
          aria-label={siteName ? `Window start (UTC), ${siteName}` : 'Window start (UTC)'}
          value={scenario.startUtc.slice(0, 10)}
          min={min}
          max={max}
          onChange={onDate}
        />
      </div>

      <div className="controls__field">
        <label htmlFor={`${id}-length`}>Window length</label>
        <select
          id={`${id}-length`}
          aria-label={siteName ? `Window length, ${siteName}` : 'Window length'}
          value={scenario.durationH}
          onChange={onDuration}
        >
          {durationOptionsH(scenario.durationH).map((h) => (
            <option key={h} value={h}>
              {h % 24 === 0 ? `${h / 24} days` : `${h} h`}
            </option>
          ))}
        </select>
      </div>

      <div className="controls__field controls__field--slip" title={SLIP_TIP}>
        <label htmlFor={`${id}-slip`}>Slip</label>
        <div className="controls__slip">
          <input
            id={`${id}-slip`}
            type="range"
            min={-MAX_SLIP_DAYS}
            max={MAX_SLIP_DAYS}
            step={1}
            value={scenario.slipDays}
            aria-label={siteName ? `Slip, days, ${siteName}` : 'Slip, days'}
            aria-valuetext={humanSlip(scenario.slipDays)}
            onChange={(e) => setSlipDays(scenario.id, Number(e.target.value))}
          />
          <output htmlFor={`${id}-slip`} className="controls__readout">
            {formatSlip(scenario.slipDays)}
          </output>
          <button
            type="button"
            className="ghost"
            disabled={scenario.slipDays === 0}
            onClick={() => setSlipDays(scenario.id, 0)}
            aria-label={siteName ? `Reset slip for ${siteName}` : 'Reset slip'}
          >
            Reset slip
          </button>
        </div>
      </div>
      {change && (
        <p className="controls__change" title="The same metrics computed for the window without the slip.">
          Change vs original (slip 0): Sun visible {formatChange(change.sunH, change.sunPp)}; Earth in view{' '}
          {formatChange(change.earthH, change.earthPp)}. pp = percentage points.
        </p>
      )}
    </div>
  )
}
