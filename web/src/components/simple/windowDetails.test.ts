import { describe, expect, it } from 'vitest'
import { detailGroups, formatDegrees, formatMastGain, formatPercent } from './simpleSummary'
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

  it('formats the mast gain', () => {
    expect(formatMastGain(0.2)).toBe('No difference')
    expect(formatMastGain(1)).toBe('+1 hour')
    expect(formatMastGain(11.6)).toBe('+12 hours')
  })
})

describe('detailGroups', () => {
  it('lists Sun, Earth and Site rows and hides the mast row without both heights', () => {
    const groups = detailGroups({
      maxSunElDeg: 5.4,
      sunPartlyHiddenPct: 20,
      mastGainH: null,
      maxEarthElDeg: 8,
      earthLitPct: 55,
      maxHillDeg: 3,
    })
    expect(groups.map((g) => g.title)).toEqual(['Sun', 'Earth', 'Site'])
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id))
    expect(ids).toEqual(['maxSun', 'partSun', 'maxEarth', 'earthLit', 'maxHill'])
    expect(groups[0].rows[0].value).toBe('5°')
  })

  it('shows the mast row when available and Not available for missing data', () => {
    const groups = detailGroups({
      maxSunElDeg: null,
      sunPartlyHiddenPct: null,
      mastGainH: 30,
      maxEarthElDeg: null,
      earthLitPct: null,
      maxHillDeg: null,
    })
    expect(groups[0].rows.at(-1)?.value).toBe('+30 hours')
    expect(groups[0].rows[0].value).toBe('Not available')
    expect(groups[2].rows[0].value).toBe('Not available')
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
