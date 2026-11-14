import { describe, expect, it } from 'vitest'
import type { EphemFile } from '../lib/types'
import {
  cellIndexAt,
  clampLanderOffset,
  computeSunVisibleHours,
  formatDeltaHours,
  formatOffset,
  legendRange,
  nudgeOffset,
  viridisRgb,
} from './landerHelpers'

describe('clampLanderOffset', () => {
  const sizePx = 256
  const spacingM = 80
  // halfSpan = 128 * 80 = 10,240 m. Default margin = 2 * 80 = 160 m. Max offset = 10,080 m.

  it('leaves offsets within patch interior unchanged with clamped=false', () => {
    const res = clampLanderOffset({ eastM: 500, northM: -300 }, sizePx, spacingM)
    expect(res.offset.eastM).toBe(500)
    expect(res.offset.northM).toBe(-300)
    expect(res.clamped).toBe(false)
  })

  it('keeps (0, 0) unchanged', () => {
    const res = clampLanderOffset({ eastM: 0, northM: 0 }, sizePx, spacingM)
    expect(res.offset.eastM).toBe(0)
    expect(res.offset.northM).toBe(0)
    expect(res.clamped).toBe(false)
  })

  it('clamps positive East exceeding interior margin and sets clamped=true', () => {
    const res = clampLanderOffset({ eastM: 11000, northM: 0 }, sizePx, spacingM)
    expect(res.offset.eastM).toBe(10080)
    expect(res.offset.northM).toBe(0)
    expect(res.clamped).toBe(true)
  })

  it('clamps negative East exceeding interior margin', () => {
    const res = clampLanderOffset({ eastM: -10500, northM: 200 }, sizePx, spacingM)
    expect(res.offset.eastM).toBe(-10080)
    expect(res.offset.northM).toBe(200)
    expect(res.clamped).toBe(true)
  })

  it('clamps positive North exceeding interior margin', () => {
    const res = clampLanderOffset({ eastM: 100, northM: 10200 }, sizePx, spacingM)
    expect(res.offset.eastM).toBe(100)
    expect(res.offset.northM).toBe(10080)
    expect(res.clamped).toBe(true)
  })

  it('clamps negative North exceeding interior margin', () => {
    const res = clampLanderOffset({ eastM: 0, northM: -10500 }, sizePx, spacingM)
    expect(res.offset.eastM).toBe(0)
    expect(res.offset.northM).toBe(-10080)
    expect(res.clamped).toBe(true)
  })

  it('respects a custom margin', () => {
    const res = clampLanderOffset({ eastM: 10200, northM: 0 }, sizePx, spacingM, 100)
    // 10240 - 100 = 10140
    expect(res.offset.eastM).toBe(10140)
    expect(res.clamped).toBe(true)
  })
})

describe('nudgeOffset', () => {
  const current = { eastM: 300, northM: 400 }

  it('nudges left by 100 m without Shift', () => {
    expect(nudgeOffset(current, 'ArrowLeft', false)).toEqual({ eastM: 200, northM: 400 })
  })

  it('nudges left by 500 m with Shift', () => {
    expect(nudgeOffset(current, 'ArrowLeft', true)).toEqual({ eastM: -200, northM: 400 })
  })

  it('nudges right by 100 m without Shift', () => {
    expect(nudgeOffset(current, 'ArrowRight', false)).toEqual({ eastM: 400, northM: 400 })
  })

  it('nudges right by 500 m with Shift', () => {
    expect(nudgeOffset(current, 'ArrowRight', true)).toEqual({ eastM: 800, northM: 400 })
  })

  it('nudges up by 100 m North without Shift', () => {
    expect(nudgeOffset(current, 'ArrowUp', false)).toEqual({ eastM: 300, northM: 500 })
  })

  it('nudges up by 500 m North with Shift', () => {
    expect(nudgeOffset(current, 'ArrowUp', true)).toEqual({ eastM: 300, northM: 900 })
  })

  it('nudges down by 100 m North without Shift', () => {
    expect(nudgeOffset(current, 'ArrowDown', false)).toEqual({ eastM: 300, northM: 300 })
  })

  it('nudges down by 500 m North with Shift', () => {
    expect(nudgeOffset(current, 'ArrowDown', true)).toEqual({ eastM: 300, northM: -100 })
  })

  it('returns null for non-arrow keys', () => {
    expect(nudgeOffset(current, 'Enter', false)).toBeNull()
    expect(nudgeOffset(current, 'KeyW', false)).toBeNull()
  })
})

describe('formatDeltaHours', () => {
  it('formats positive values with plus sign and one decimal place', () => {
    expect(formatDeltaHours(1.54)).toBe('+1.5 h')
    expect(formatDeltaHours(10)).toBe('+10.0 h')
    expect(formatDeltaHours(0.1)).toBe('+0.1 h')
  })

  it('formats negative values with minus sign and one decimal place', () => {
    expect(formatDeltaHours(-0.78)).toBe('-0.8 h')
    expect(formatDeltaHours(-12.34)).toBe('-12.3 h')
    expect(formatDeltaHours(-0.1)).toBe('-0.1 h')
  })

  it('formats zero as +0.0 h', () => {
    expect(formatDeltaHours(0)).toBe('+0.0 h')
  })

  it('formats near-zero values (< 0.05 h) as +0.0 h without negative zero', () => {
    expect(formatDeltaHours(0.04)).toBe('+0.0 h')
    expect(formatDeltaHours(-0.04)).toBe('+0.0 h')
  })
})

describe('legendRange', () => {
  it('returns min and max of a valid array', () => {
    const grid = new Float32Array([10, 25.5, 80, 45, 95.5])
    const res = legendRange(grid)
    expect(res.min).toBe(10)
    expect(res.max).toBe(95.5)
  })

  it('ignores NaN values', () => {
    const grid = new Float32Array([Number.NaN, 20, 75, Number.NaN, 50])
    expect(legendRange(grid)).toEqual({ min: 20, max: 75 })
  })

  it('falls back to 0..100 for all-NaN array', () => {
    const grid = new Float32Array([Number.NaN, Number.NaN])
    expect(legendRange(grid)).toEqual({ min: 0, max: 100 })
  })

  it('falls back to 0..100 for empty array', () => {
    const grid = new Float32Array(0)
    expect(legendRange(grid)).toEqual({ min: 0, max: 100 })
  })

  it('handles single value array', () => {
    const grid = new Float32Array([50, 50, 50])
    expect(legendRange(grid)).toEqual({ min: 50, max: 50 })
  })
})

describe('formatOffset', () => {
  it('formats offset with distance and signed coordinates', () => {
    expect(formatOffset({ eastM: 300, northM: 400 })).toBe('500 m (+300 m E, +400 m N)')
    expect(formatOffset({ eastM: -300, northM: -400 })).toBe('500 m (-300 m E, -400 m N)')
    expect(formatOffset({ eastM: 0, northM: 0 })).toBe('0 m (+0 m E, +0 m N)')
  })
})

describe('cellIndexAt', () => {
  const extentM = 2000
  const gridN = 4 // cellSize = 500 m, half = 1000 m

  it('finds cell index for points in grid', () => {
    // NW cell: east = -800, north = +800 -> col 0, row 0 -> index 0
    expect(cellIndexAt(-800, 800, extentM, gridN)).toEqual({ row: 0, col: 0, index: 0 })
    // SE cell: east = +800, north = -800 -> col 3, row 3 -> index 15
    expect(cellIndexAt(800, -800, extentM, gridN)).toEqual({ row: 3, col: 3, index: 15 })
  })

  it('returns null for points outside grid', () => {
    expect(cellIndexAt(1500, 0, extentM, gridN)).toBeNull()
    expect(cellIndexAt(0, -1500, extentM, gridN)).toBeNull()
  })
})

describe('viridisRgb', () => {
  it('returns deep purple stop at 0', () => {
    expect(viridisRgb(0)).toEqual([68, 1, 84])
  })

  it('returns yellow stop at 1', () => {
    expect(viridisRgb(1)).toEqual([253, 231, 37])
  })

  it('interpolates midpoint smoothly', () => {
    const mid = viridisRgb(0.5)
    expect(mid[0]).toBe(33)
    expect(mid[1]).toBe(145)
    expect(mid[2]).toBe(140)
  })
})

describe('computeSunVisibleHours', () => {
  function makeMockEphem(
    count: number,
    sunAz: number[],
    sunEl: number[],
    stepMinutes = 60,
  ): EphemFile {
    const startUtc = '2026-01-01T00:00:00Z'
    return {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'test',
      start_utc: startUtc,
      step_minutes: stepMinutes,
      count,
      sun: { az: sunAz, el: sunEl },
      earth: { az: new Array(count).fill(0), el: new Array(count).fill(0) },
      sun_ang_radius_deg: 0.2666,
      earth_ang_radius_deg: 0.95,
    }
  }

  it('calculates correct hours for 24 hourly samples with half above 0 deg horizon', () => {
    const count = 24
    const az = new Array(count).fill(0)
    // First 12 samples: el = 2 (above 0), next 12: el = -2 (below 0)
    const el = [...new Array(12).fill(2), ...new Array(12).fill(-2)]
    const ephem = makeMockEphem(count, az, el, 60)
    const mask = new Float32Array(360).fill(0) // flat 0 deg horizon

    const startMs = Date.parse('2026-01-01T00:00:00Z')
    const endMs = startMs + 24 * 3600_000

    const hours = computeSunVisibleHours(ephem, mask, 1, startMs, endMs)
    expect(hours).toBe(12.0)
  })

  it('returns 0 if all samples below horizon', () => {
    const count = 24
    const az = new Array(count).fill(0)
    const el = new Array(count).fill(-5)
    const ephem = makeMockEphem(count, az, el, 60)
    const mask = new Float32Array(360).fill(0)

    const startMs = Date.parse('2026-01-01T00:00:00Z')
    const endMs = startMs + 24 * 3600_000

    const hours = computeSunVisibleHours(ephem, mask, 1, startMs, endMs)
    expect(hours).toBe(0.0)
  })

  it('returns null if window has no samples', () => {
    const ephem = makeMockEphem(10, new Array(10).fill(0), new Array(10).fill(1), 60)
    const mask = new Float32Array(360).fill(0)
    expect(computeSunVisibleHours(ephem, mask, 1, 1000, 500)).toBeNull()
  })
})
