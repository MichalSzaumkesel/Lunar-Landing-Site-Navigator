import { describe, expect, it } from 'vitest'
import { scenarioCursorMs, scenarioCursorUtc, scenarioWindowMs } from './selectors'
import type { Scenario } from './types'

// 2027-01-01T00:00:00Z = 1798761600000 ms (1767225600 s for 2026-01-01 + 365 days).
const START = 1798761600000
const HOUR = 3_600_000
const DAY = 86_400_000

const base: Scenario = { id: 'sc1', siteId: 'x', startUtc: '2027-01-01T00:00:00Z', durationH: 48, slipDays: 0 }

describe('scenarioWindowMs', () => {
  it('shifts the start by the slip and lasts durationH', () => {
    const w = scenarioWindowMs({ ...base, slipDays: 2 })
    expect(w.startMs).toBe(START + 2 * DAY)
    expect(w.startMs).toBe(1798934400000)
    expect(w.endMs).toBe(1798934400000 + 48 * HOUR)
  })

  it('supports negative slip', () => {
    expect(scenarioWindowMs({ ...base, slipDays: -1 }).startMs).toBe(START - DAY)
  })

  it('falls back to epoch 0, no slip and a 1 h window on invalid input', () => {
    const w = scenarioWindowMs({ ...base, startUtc: 'invalid', durationH: NaN, slipDays: NaN })
    expect(w).toEqual({ startMs: 0, endMs: HOUR })
  })

  it('treats a non-positive duration as 1 h', () => {
    expect(scenarioWindowMs({ ...base, durationH: 0 }).endMs - START).toBe(HOUR)
  })
})

describe('scenarioCursorMs', () => {
  it('clamps the cursor to the window', () => {
    expect(scenarioCursorMs(base, -5)).toBe(START)
    expect(scenarioCursorMs(base, 60)).toBe(START + 48 * HOUR)
    expect(scenarioCursorMs(base, 12)).toBe(START + 12 * HOUR)
  })

  it('follows the slipped start', () => {
    expect(scenarioCursorMs({ ...base, slipDays: 1 }, 1)).toBe(START + DAY + HOUR)
  })

  it('uses 0 h for a NaN cursor', () => {
    expect(scenarioCursorMs(base, NaN)).toBe(START)
  })
})

describe('scenarioCursorUtc', () => {
  it('formats whole seconds with a trailing Z', () => {
    expect(scenarioCursorUtc(base, 1.5)).toBe('2027-01-01T01:30:00Z')
    expect(scenarioCursorUtc(base, 0)).toBe('2027-01-01T00:00:00Z')
  })

  it('rounds to the nearest second', () => {
    // 0.0001 h = 0.36 s rounds down; 0.0002 h = 0.72 s rounds up
    expect(scenarioCursorUtc(base, 0.0001)).toBe('2027-01-01T00:00:00Z')
    expect(scenarioCursorUtc(base, 0.0002)).toBe('2027-01-01T00:00:01Z')
  })

  it('does not throw for a corrupt scenario', () => {
    expect(() => scenarioCursorUtc({ ...base, startUtc: 'bad', slipDays: 1e12 }, 1)).not.toThrow()
  })
})
