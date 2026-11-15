import { describe, expect, it } from 'vitest'
import { BOTH_DERIVED_TIP, computeBothVisible, formatBothVisible } from './bothVisible'
import { computeMetrics } from './metrics'
import type { EphemFile, HorizonFile, SiteBundle } from './types'

const META = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: true,
  approximate: false,
  inputs: [],
}
const START = Date.parse('2026-12-01T00:00:00Z')
const H = 3_600_000

function horizon(mask: number[] = new Array(720).fill(0)): HorizonFile {
  return { meta: META, site_id: 't', az_step_deg: 0.5, n: 720, observer_heights_m: [2], masks: { '2': mask } }
}

/** Hourly samples; Sun el [1,2,3,2,1,0,-1,-2], Earth el 5 except -1 at hour 2. */
function ephem(over: Partial<EphemFile> = {}): EphemFile {
  return {
    meta: META,
    site_id: 't',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 8,
    sun: { az: [0, 10, 20, 30, 40, 50, 60, 70], el: [1, 2, 3, 2, 1, 0, -1, -2] },
    earth: { az: new Array(8).fill(100), el: [5, 5, -1, 5, 5, 5, 5, 5] },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
    ...over,
  }
}

const bundle = (h = horizon(), e = ephem()): Pick<SiteBundle, 'horizon' | 'ephem'> => ({ horizon: h, ephem: e })
const win = (a: number, b: number) => ({ observerHeightM: 2 as const, startMs: START + a * H, endMs: START + b * H })

describe('computeBothVisible', () => {
  it('counts samples where Sun and Earth are both above a flat horizon', () => {
    // Sun on at hours 0-5, Earth off at hour 2 -> both on at 0,1,3,4,5.
    const r = computeBothVisible(bundle(), win(0, 8))!
    expect(r.samples).toBe(8)
    expect(r.pct).toBeCloseTo(62.5, 10)
    expect(r.longestH).toBe(3)
  })

  it('treats the window end as exclusive', () => {
    // Hours 2,3,4: Earth off, on, on; Sun on -> 2 of 3, longest 2.
    const r = computeBothVisible(bundle(), win(2, 5))!
    expect(r.samples).toBe(3)
    expect(r.pct).toBeCloseTo(66.667, 2)
    expect(r.longestH).toBe(2)
  })

  it('uses the terrain mask, not just the flat horizon', () => {
    // 2 deg flat mask: Sun el >= 2 only at hours 1,2,3; Earth off at 2 -> both at 1 and 3.
    const r = computeBothVisible(bundle(horizon(new Array(720).fill(2))), win(0, 8))!
    expect(r.pct).toBe(25)
    expect(r.longestH).toBe(1)
  })

  it('is zero when a hill hides the Earth at its azimuth all the time', () => {
    const mask = new Array(720).fill(0)
    mask[200] = 10 // azimuth 100 deg, above the Earth elevation of 5 deg
    const r = computeBothVisible(bundle(horizon(mask)), win(0, 8))!
    expect(r.pct).toBe(0)
    expect(r.longestH).toBe(0)
  })

  it('scales the longest stretch by the sample step', () => {
    const e = ephem({ step_minutes: 30 })
    const r = computeBothVisible(bundle(horizon(), e), { observerHeightM: 2, startMs: START, endMs: START + 4 * H })!
    expect(r.samples).toBe(8)
    expect(r.longestH).toBe(1.5) // three half-hour samples in a row
  })

  it('returns null outside the coverage and for empty windows', () => {
    expect(computeBothVisible(bundle(), win(100, 110))).toBeNull()
    expect(computeBothVisible(bundle(), win(3, 3))).toBeNull()
  })

  it('matches pct_both of computeMetrics for the same window', () => {
    for (const [a, b] of [[0, 8], [1, 6], [2, 7]] as const) {
      const w = win(a, b)
      const m = computeMetrics(bundle(), { ...w, refMs: w.startMs })!
      expect(computeBothVisible(bundle(), w)!.pct).toBeCloseTo(m.pct_both, 10)
    }
  })
})

describe('formatBothVisible', () => {
  it('formats the share and the longest stretch', () => {
    expect(formatBothVisible({ pct: 62.5, longestH: 3, samples: 8 })).toBe('62.5 % of window; longest 3 h')
    expect(formatBothVisible({ pct: 10, longestH: 72, samples: 100 })).toBe('10.0 % of window; longest 3 d')
  })
  it('explains that it is derived from the same samples', () => {
    expect(BOTH_DERIVED_TIP).toMatch(/Derived/)
    expect(BOTH_DERIVED_TIP).toMatch(/same samples/)
  })
})
