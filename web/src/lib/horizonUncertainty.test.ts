import { describe, expect, it } from 'vitest'
import {
  computeShareRange,
  formatShareRange,
  horizonShareRange,
  horizonUncertaintyDeg,
  shiftMask,
  shareRangeVisible,
  uncertaintyTip,
} from './horizonUncertainty.ts'
import { computeMetrics } from './metrics.ts'
import type { EphemFile, HorizonFile, SiteBundle } from './types.ts'

const meta = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: false,
  approximate: false,
  inputs: [],
}

function bundle(u?: number): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const horizon: HorizonFile = {
    meta,
    site_id: 't',
    az_step_deg: 0.5,
    n: 720,
    observer_heights_m: [2],
    masks: { '2': new Array(720).fill(0) },
    ...(u === undefined ? {} : { uncertainty_deg: u }),
  }
  const ephem: EphemFile = {
    meta,
    site_id: 't',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 8,
    sun: { az: [0, 10, 20, 30, 40, 50, 60, 70], el: [1, 2, 3, 2, 1, 0, -1, -2] },
    earth: { az: new Array(8).fill(100), el: new Array(8).fill(5) },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
  }
  return { horizon, ephem }
}

const START = Date.parse('2026-12-01T00:00:00Z')
const input = { observerHeightM: 2 as const, startMs: START, endMs: START + 8 * 3_600_000, refMs: START }

describe('horizon uncertainty', () => {
  it('reads only positive finite values', () => {
    expect(horizonUncertaintyDeg(bundle(0.15).horizon)).toBe(0.15)
    expect(horizonUncertaintyDeg(bundle().horizon)).toBeNull()
    expect(horizonUncertaintyDeg(bundle(0).horizon)).toBeNull()
    expect(horizonUncertaintyDeg(bundle(Number.NaN).horizon)).toBeNull()
    expect(horizonUncertaintyDeg(null)).toBeNull()
  })

  it('shifts a mask without touching the input', () => {
    const m = [0, 1, 2]
    expect(shiftMask(m, 0.5)).toEqual([0.5, 1.5, 2.5])
    expect(m).toEqual([0, 1, 2])
  })

  it('u = 0 equals the base value', () => {
    const b = bundle(0.15)
    const base = computeMetrics(b, input)!
    const r = computeShareRange(b, input, 0)!
    expect(r.sun).toEqual({ lo: base.pct_sunlit, hi: base.pct_sunlit })
    expect(r.earth).toEqual({ lo: base.pct_earth, hi: base.pct_earth })
  })

  it('matches a hand count: flat horizon, Sun elevations 1 2 3 2 1 0 -1 -2', () => {
    const b = bundle(1)
    // base: el >= 0 -> 6 of 8
    expect(computeMetrics(b, input)!.pct_sunlit).toBe(75)
    // +1 deg: el >= 1 -> 5 of 8; -1 deg: el >= -1 -> 7 of 8
    const r = computeShareRange(b, input, 1)!
    expect(r.sun).toEqual({ lo: 62.5, hi: 87.5 })
    // +0.5 deg: el >= 0.5 -> 5 of 8; -0.5 deg: el >= -0.5 -> 6 of 8
    expect(computeShareRange(b, input, 0.5)!.sun).toEqual({ lo: 62.5, hi: 75 })
    // Earth stays at 5 deg
    expect(r.earth).toEqual({ lo: 100, hi: 100 })
  })

  it('bounds the base value and grows monotonically with u', () => {
    const b = bundle(1)
    const base = computeMetrics(b, input)!
    let prev = { lo: base.pct_sunlit, hi: base.pct_sunlit }
    for (const u of [0.25, 0.5, 1, 2, 4]) {
      const r = computeShareRange(b, input, u)!
      expect(r.sun.lo).toBeLessThanOrEqual(prev.lo)
      expect(r.sun.hi).toBeGreaterThanOrEqual(prev.hi)
      expect(r.sun.lo).toBeLessThanOrEqual(base.pct_sunlit)
      expect(r.sun.hi).toBeGreaterThanOrEqual(base.pct_sunlit)
      prev = r.sun
    }
  })

  it('does not mutate the bundle masks', () => {
    const b = bundle(1)
    computeShareRange(b, input, 1)
    expect(b.horizon.masks['2'].every((v) => v === 0)).toBe(true)
  })

  it('returns null for an empty window', () => {
    expect(computeShareRange(bundle(1), { ...input, endMs: input.startMs }, 1)).toBeNull()
  })

  it('is memoised per bundle, height and window, and absent without uncertainty_deg', () => {
    const b = bundle(1)
    const a = horizonShareRange(b, 2, input.startMs, input.endMs)
    expect(a).not.toBeNull()
    expect(horizonShareRange(b, 2, input.startMs, input.endMs)).toBe(a)
    expect(horizonShareRange(b, 2, input.startMs, input.endMs - 3_600_000)).not.toBe(a)
    expect(horizonShareRange(bundle(), 2, input.startMs, input.endMs)).toBeNull()
  })

  it('formats the range and the tooltip', () => {
    expect(formatShareRange({ lo: 50.94, hi: 53.04 })).toBe('50.9–53.0')
    const tip = uncertaintyTip(0.15)
    expect(tip).toContain('±0.15°')
    expect(tip).toContain('excludes LOLA height and geolocation error')
  })
})

describe('shareRangeVisible', () => {
  it('hides ranges whose ends are equal or equal at one decimal', () => {
    expect(shareRangeVisible({ lo: 100, hi: 100 })).toBe(false)
    expect(shareRangeVisible({ lo: 63.91, hi: 63.94 })).toBe(false)
    expect(shareRangeVisible(null)).toBe(false)
    expect(shareRangeVisible({ lo: 63.9, hi: 67.8 })).toBe(true)
  })
})
