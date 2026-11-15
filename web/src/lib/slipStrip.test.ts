import { describe, expect, it } from 'vitest'
import { cellTooltip, computeSlipCell, passingRange, slipValues, stripKey, stripSentence } from './slipStrip'
import type { SlipCell } from './slipStrip'
import type { MissionRules, SiteBundle } from './types'

const cell = (slip: number, rulesOk: boolean | null, hasData = true): SlipCell => ({
  slip,
  hasData,
  sunPct: hasData ? 52.4 : null,
  earthPct: hasData ? 85 : null,
  rulesOk,
})
const cells = (pass: number[], from = -10, to = 10): SlipCell[] => {
  const out: SlipCell[] = []
  for (let s = from; s <= to; s++) out.push(cell(s, pass.includes(s)))
  return out
}

describe('slipValues', () => {
  it('lists 121 slips from -60 to +60', () => {
    const v = slipValues()
    expect(v).toHaveLength(121)
    expect(v[0]).toBe(-60)
    expect(v[120]).toBe(60)
  })
})

describe('passingRange', () => {
  it('returns the run that contains the current slip', () => {
    expect(passingRange(cells([-3, -2, -1, 0, 1, 2, 3, 4, 5, 8, 9]), 1)).toEqual({ from: -3, to: 5 })
  })
  it('without a run around the current slip takes the nearest one', () => {
    expect(passingRange(cells([-9, -8, -7, 6, 7]), 0)).toEqual({ from: 6, to: 7 })
    expect(passingRange(cells([-9, -8, -7, 6, 7]), -4)).toEqual({ from: -9, to: -7 })
  })
  it('breaks distance ties by the longer run', () => {
    expect(passingRange(cells([-4, 4, 5]), 0)).toEqual({ from: 4, to: 5 })
  })
  it('a no-data gap splits a run; null when nothing passes', () => {
    const c = cells([1, 2, 3, 4])
    c[12] = cell(2, null, false)
    expect(passingRange(c, 1)).toEqual({ from: 1, to: 1 })
    expect(passingRange(c, 4)).toEqual({ from: 3, to: 4 })
    expect(passingRange(cells([]), 0)).toBeNull()
  })
})

describe('stripSentence', () => {
  it('describes a range, a single slip, none and no rules', () => {
    expect(stripSentence(cells([-3, -2, -1, 0, 1, 2, 3, 4, 5]), 0, true)).toBe(
      'Mission rules hold for slips from -3 to +5 days.',
    )
    expect(stripSentence(cells([2]), 0, true)).toBe('Mission rules hold for a slip of +2 days.')
    expect(stripSentence(cells([]), 0, true)).toBe('No slip between -60 and +60 days meets the mission rules.')
    expect(stripSentence(cells([]), 0, false)).toMatch(/only shows Sun visible/)
  })
})

describe('cellTooltip', () => {
  it('formats values and out-of-range cells', () => {
    expect(cellTooltip(cell(5, null))).toBe('slip +5 d: Sun visible 52%, Earth in view 85%')
    expect(cellTooltip(cell(-2, true))).toBe('slip -2 d: Sun visible 52%, Earth in view 85%, rules met')
    expect(cellTooltip(cell(0, null, false))).toBe('slip 0 d: No data')
  })
})

describe('computeSlipCell', () => {
  // 48 hourly samples from 2027-01-01: Sun always above a flat horizon, Earth always below it.
  const n = 48
  const bundle = {
    horizon: { az_step_deg: 90, masks: { '2': [0, 0, 0, 0], '10': [0, 0, 0, 0] } },
    ephem: {
      start_utc: '2027-01-01T00:00:00Z',
      step_minutes: 60,
      count: n,
      sun_ang_radius_deg: 0.27,
      sun: { az: Array(n).fill(10), el: Array(n).fill(20) },
      earth: { az: Array(n).fill(10), el: Array(n).fill(-20) },
    },
  } as unknown as SiteBundle
  const base = Date.parse('2027-01-01T00:00:00Z')
  const rules: MissionRules = {
    observerHeightM: 2,
    missionDurationH: 6,
    minPctSunlit: 50,
    maxLongestDarkH: 10,
    earthAtLandingRequired: false,
    minPctEarth: 0,
  }

  it('maps in-range windows to percentages and rule verdicts', () => {
    const c = computeSlipCell(bundle, 2, base, 12, 0, rules)
    expect(c.hasData).toBe(true)
    expect(c.sunPct).toBe(100)
    expect(c.earthPct).toBe(0)
    expect(c.rulesOk).toBe(true)
    expect(computeSlipCell(bundle, 2, base, 12, 0, null).rulesOk).toBeNull()
  })
  it('marks windows leaving the ephemeris as no data', () => {
    expect(computeSlipCell(bundle, 2, base, 12, -1, rules).hasData).toBe(false)
    expect(computeSlipCell(bundle, 2, base, 12, 2, rules).hasData).toBe(false)
    // A 24 h window at slip 1 ends right after the last sample (47 h): still in range.
    expect(computeSlipCell(bundle, 2, base, 24, 1, rules).hasData).toBe(true)
  })
})

describe('stripKey', () => {
  it('changes with height and ignores nothing else it is given', () => {
    const a = stripKey('s', 1, 24, 2, null)
    expect(stripKey('s', 1, 24, 2, null)).toBe(a)
    expect(stripKey('s', 1, 24, 10, null)).not.toBe(a)
  })
})
