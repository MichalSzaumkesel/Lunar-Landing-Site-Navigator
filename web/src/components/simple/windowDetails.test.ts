import { describe, expect, it } from 'vitest'
import { windowGroups, formatDegrees, formatHighestElevation, formatMastGain, formatPercent } from './simpleSummary'
import { computeWindowDetails } from './windowDetails'
import type { SiteBundle } from '../../lib/types'

describe('detail formatters', () => {
  it('rounds degrees and percent, and handles missing values', () => {
    expect(formatDegrees(12.4)).toBe('12°')
    expect(formatDegrees(-0.2)).toBe('0°')
    expect(formatDegrees(null)).toBe('Not available')
    expect(formatDegrees(Number.NaN)).toBe('Not available')
    expect(formatPercent(36.6)).toBe('37%')
    expect(formatPercent(140)).toBe('100%')
    expect(formatPercent(undefined)).toBe('Not available')
  })

  it('does not round a value below the zenith up to 90', () => {
    expect(formatDegrees(89.4)).toBe('89°')
    expect(formatDegrees(89.7)).toBe('89°')
    expect(formatDegrees(89.99)).toBe('89°')
    expect(formatDegrees(90)).toBe('90°')
    expect(formatDegrees(87.2)).toBe('87°')
  })

  it('says "Never above the horizon" instead of a negative highest elevation', () => {
    expect(formatHighestElevation(-38.4)).toBe('Never above the horizon')
    expect(formatHighestElevation(-0.2)).toBe('Never above the horizon')
    expect(formatHighestElevation(0)).toBe('Never above the horizon')
    expect(formatHighestElevation(0.6)).toBe('1°')
    expect(formatHighestElevation(89.7)).toBe('89°')
    expect(formatHighestElevation(null)).toBe('Not available')
  })

  it('formats the mast gain', () => {
    expect(formatMastGain(0.2)).toBe('No difference')
    expect(formatMastGain(1)).toBe('+1 hour')
    expect(formatMastGain(11.6)).toBe('+12 hours')
  })
})

const metrics = { pct_sunlit: 51, longest_dark_h: 100, pct_earth: 100, longest_no_earth_h: 0 }

describe('windowGroups', () => {
  it('builds Sun and Earth trees', () => {
    const groups = windowGroups(metrics, 720, {
      maxSunElDeg: 5.4,
      sunPartlyHiddenPct: 20,
      mastGainH: null,
      maxEarthElDeg: 8,
      earthLitPct: 55,
      maxHillDeg: 3,
    })
    expect(groups.map((g) => g.title)).toEqual(['Sun', 'Earth'])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['sun', 'dark', 'maxSun'])
    expect(groups[1].rows.map((r) => r.id)).toEqual(['earth', 'noEarth', 'maxEarth'])
    expect(groups[0].rows[0].value).toBe('51% of 30 days')
    expect(groups[0].rows[2].value).toBe('5°')
  })

  it('shows the far-side wording for Earth (and the Sun) that never rise', () => {
    const groups = windowGroups(metrics, 720, {
      maxSunElDeg: -3.2,
      sunPartlyHiddenPct: null,
      mastGainH: null,
      maxEarthElDeg: -38.1,
      earthLitPct: null,
      maxHillDeg: null,
    })
    expect(groups[1].rows[2].label).toBe('Highest Earth above the horizon')
    expect(groups[1].rows[2].value).toBe('Never above the horizon')
    expect(groups[0].rows[2].value).toBe('Never above the horizon')
  })

  it('shows Not available for missing data', () => {
    const groups = windowGroups(metrics, 720, {
      maxSunElDeg: null,
      sunPartlyHiddenPct: null,
      mastGainH: 30,
      maxEarthElDeg: null,
      earthLitPct: null,
      maxHillDeg: null,
    })
    expect(groups[0].rows[2].value).toBe('Not available')
    expect(groups[1].rows[2].value).toBe('Not available')
  })
})

describe('computeWindowDetails', () => {
  const mask = (v: number) => new Array(4).fill(v)
  const bundle = {
    horizon: { az_step_deg: 90, masks: { '2': [0, 4, 0, 0], '10': mask(0) } },
    ephem: {
      start_utc: '2026-01-01T00:00:00Z',
      step_minutes: 60,
      count: 4,
      sun: { az: [0, 0, 0, 0], el: [-5, 2, 10, 6] },
      earth: { az: [180, 180, 180, 180], el: [1, 3, 7, -1] },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1,
    },
  } as unknown as SiteBundle

  it('finds maxima, hill height and a mast gain', () => {
    const d = computeWindowDetails(bundle, 2, Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-01T04:00:00Z'))
    expect(d.maxSunElDeg).toBe(10)
    expect(d.maxEarthElDeg).toBe(7)
    expect(d.maxHillDeg).toBe(4)
    expect(d.sunPartlyHiddenPct).toBe(0)
    expect(d.earthLitPct).toBeGreaterThan(90)
    expect(d.mastGainH).not.toBeNull()
  })

  it('returns nulls for a window outside the data', () => {
    const d = computeWindowDetails(bundle, 2, Date.parse('2030-01-01T00:00:00Z'), Date.parse('2030-01-02T00:00:00Z'))
    expect(d.maxSunElDeg).toBeNull()
    expect(d.earthLitPct).toBeNull()
    expect(d.maxHillDeg).toBe(4)
  })
})
