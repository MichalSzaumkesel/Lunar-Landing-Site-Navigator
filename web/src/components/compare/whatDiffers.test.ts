import { describe, expect, it } from 'vitest'
import type { Scenario } from '../../state/types'
import type { ScenarioCompareData } from './compareLogic'
import { diffLabels, pickDiffPair, whatDiffersFor, whatDiffersSentence, type DiffSide } from './whatDiffers'

const side = (label: string, o: Partial<DiffSide> = {}): DiffSide => ({
  label,
  pctSun: 80,
  longestDarkH: 24,
  pctEarth: 50,
  longestNoEarthH: 100,
  ...o,
})

describe('whatDiffersSentence', () => {
  it('compares Sun share and dark stretch, in points and days', () => {
    const s = whatDiffersSentence({
      a: side('Site A', { pctEarth: null, longestNoEarthH: null }),
      b: side('Site B', { pctSun: 36, longestDarkH: 24 + 9 * 24, pctEarth: null, longestNoEarthH: null }),
    })
    expect(s).toBe('Site B has 44 points less Sun visible and a dark stretch 9 days longer than Site A.')
  })

  it('uses more and shorter when B is ahead on both', () => {
    const s = whatDiffersSentence({
      a: side('A', { pctEarth: null, longestNoEarthH: null }),
      b: side('B', { pctSun: 81, longestDarkH: 18, pctEarth: null, longestNoEarthH: null }),
    })
    expect(s).toBe('B has 1 point more Sun visible and a dark stretch 6 hours shorter than A.')
  })

  it('says about the same when the shares round to the same value', () => {
    const s = whatDiffersSentence({
      a: side('A', { pctEarth: null, longestNoEarthH: null }),
      b: side('B', { pctSun: 80.4, longestDarkH: 30, pctEarth: null, longestNoEarthH: null }),
    })
    expect(s).toBe('B has about the same Sun visible as A, with a dark stretch 6 hours longer.')
  })

  it('handles a similar stretch with a different share', () => {
    const s = whatDiffersSentence({
      a: side('A', { pctEarth: null, longestNoEarthH: null }),
      b: side('B', { pctSun: 70, longestDarkH: 24.2, pctEarth: null, longestNoEarthH: null }),
    })
    expect(s).toBe('B has 10 points less Sun visible than A, with a similar dark stretch.')
  })

  it('handles a full tie on both bodies', () => {
    const s = whatDiffersSentence({ a: side('A'), b: side('B') })
    expect(s).toBe(
      'B and A have about the same Sun visible and dark stretch. They have about the same Earth in view and stretch without Earth.',
    )
  })

  it('adds an Earth sentence when it differs', () => {
    const s = whatDiffersSentence({ a: side('A'), b: side('B', { pctEarth: 62, longestNoEarthH: 52 }) })
    expect(s).toContain('It has 12 points more Earth in view and a stretch without Earth 2 days shorter than A.')
  })

  it('skips a body whose values are missing and keeps the other', () => {
    const s = whatDiffersSentence({
      a: side('A', { pctSun: null, longestDarkH: null }),
      b: side('B', { pctSun: 10, longestDarkH: 5, pctEarth: 40, longestNoEarthH: 4 }),
    })
    expect(s).toBe('B has 10 points less Earth in view and a stretch without Earth 4 days shorter than A.')
  })

  it('falls back to the gap alone when the share is missing', () => {
    const s = whatDiffersSentence({
      a: side('A', { pctSun: null, pctEarth: null, longestNoEarthH: null }),
      b: side('B', { pctSun: 1, longestDarkH: 72, pctEarth: null, longestNoEarthH: null }),
    })
    expect(s).toBe('B has a dark stretch 2 days longer than A.')
  })

  it('returns null when nothing can be compared', () => {
    const none = { pctSun: null, longestDarkH: null, pctEarth: null, longestNoEarthH: null }
    expect(whatDiffersSentence({ a: side('A', none), b: side('B', none) })).toBeNull()
    expect(whatDiffersSentence({ a: side('A', { pctSun: NaN }), b: side('B', { pctSun: 3 }) })).not.toContain('NaN')
  })

  it('flags demo data and never names a better site', () => {
    const s = whatDiffersSentence({ a: side('A'), b: side('B', { pctSun: 10 }), synthetic: true })!
    expect(s.endsWith('Based on demo data.')).toBe(true)
    expect(s).not.toMatch(/better|worse|best|power|energy|signal|link/i)
  })
})

function scenario(id: string, siteId: string, startUtc = '2027-10-06T00:00:00Z'): Scenario {
  return { id, siteId, startUtc, durationH: 720, slipDays: 0 } as Scenario
}

function data(sc: Scenario, name: string | null, values: Partial<ScenarioCompareData['values']>, status: ScenarioCompareData['status'] = 'ready'): ScenarioCompareData {
  return {
    scenario: sc,
    bundle: name ? ({ site: { name }, synthetic: false } as never) : null,
    status,
    metrics: null,
    highestHorizonDeg: null,
    minSunClearanceDeg: null,
    bothVisible: null,
    values: { pct_earth: null, longest_no_earth_h: null, ...values } as never,
    displayValues: {} as never,
  }
}

describe('pairing and labels', () => {
  const a = data(scenario('1', 'x'), 'Alpha', { pct_sunlit: 90, longest_dark_h: 10 })
  const b = data(scenario('2', 'y'), 'Beta', { pct_sunlit: 70, longest_dark_h: 34 })
  const c = data(scenario('3', 'z'), 'Gamma', {})

  it('picks the active scenario against the first other one', () => {
    expect(pickDiffPair([a, b, c], '2')).toEqual([b, a])
    expect(pickDiffPair([a, b, c], null)).toEqual([a, b])
    expect(pickDiffPair([a], '1')).toBeNull()
  })

  it('builds the sentence for a ready pair and nothing for a pair still loading', () => {
    expect(whatDiffersFor(a, b)).toBe('Beta has 20 points less Sun visible and a dark stretch 24 hours longer than Alpha.')
    expect(whatDiffersFor(a, data(scenario('4', 'w'), null, {}, 'loading'))).toBeNull()
  })

  it('tells same-site scenarios apart by window', () => {
    const s1 = data(scenario('1', 'x', '2027-10-06T00:00:00Z'), 'Alpha', {})
    const s2 = data(scenario('2', 'x', '2027-11-06T00:00:00Z'), 'Alpha', {})
    const [la, lb] = diffLabels(s1, s2)
    expect(la).not.toBe(lb)
    expect(la).toContain('Alpha (Oct 6')
    expect(lb).toContain('Alpha (Nov 6')
  })
})
