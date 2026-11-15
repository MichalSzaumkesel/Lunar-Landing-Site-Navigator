import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, MissionRules } from '../../lib/types'
import { findWindows } from '../../lib/finder'
import {
  clampMissionStartH,
  evaluateMissionRulesAt,
  missionBarDecision,
  missionBarLabel,
  missionKeyStepH,
} from './missionBar'

describe('missionBarDecision', () => {
  it('returns green and "Rules met" when rules pass', () => {
    const res = missionBarDecision(true)
    expect(res.valid).toBe(true)
    expect(res.color).toBe('green')
    expect(res.label).toBe('Rules met')
    expect(res.failingRule).toBeNull()
    expect(res.text).toBe('Rules met')
  })

  it('returns red, "Rules not met" and the first failing rule name when a rule fails', () => {
    const res1 = missionBarDecision(false, 'Earth at landing')
    expect(res1.valid).toBe(false)
    expect(res1.color).toBe('red')
    expect(res1.label).toBe('Rules not met')
    expect(res1.failingRule).toBe('Earth at landing')
    expect(res1.text).toBe('Rules not met: Earth at landing')

    const res2 = missionBarDecision(false, 'Min % Sun visible')
    expect(res2.color).toBe('red')
    expect(res2.failingRule).toBe('Min % Sun visible')

    const res3 = missionBarDecision(false)
    expect(res3.color).toBe('red')
    expect(res3.label).toBe('Rules not met')
  })
})

describe('clampMissionStartH', () => {
  it('clamps at both lower and upper bounds', () => {
    // 336 h window with 240 h mission -> max start is 96 h
    expect(clampMissionStartH(-10, 336, 240)).toBe(0)
    expect(clampMissionStartH(-0.1, 336, 240)).toBe(0)
    expect(clampMissionStartH(0, 336, 240)).toBe(0)
    expect(clampMissionStartH(50, 336, 240)).toBe(50)
    expect(clampMissionStartH(96, 336, 240)).toBe(96)
    expect(clampMissionStartH(96.1, 336, 240)).toBe(96)
    expect(clampMissionStartH(200, 336, 240)).toBe(96)
  })

  it('clamps to 0 when mission duration exceeds window duration', () => {
    expect(clampMissionStartH(10, 100, 240)).toBe(0)
    expect(clampMissionStartH(-5, 100, 240)).toBe(0)
  })

  it('supports 2-argument clamp to [0, durationH]', () => {
    expect(clampMissionStartH(-20, 100)).toBe(0)
    expect(clampMissionStartH(50, 100)).toBe(50)
    expect(clampMissionStartH(150, 100)).toBe(100)
  })

  it('handles non-finite values safely', () => {
    expect(clampMissionStartH(NaN, 100, 50)).toBe(0)
    expect(clampMissionStartH(Infinity, 100, 50)).toBe(0)
  })
})

describe('missionKeyStepH', () => {
  it('steps ±1 h with plain arrow keys', () => {
    expect(missionKeyStepH('ArrowRight', false)).toBe(1)
    expect(missionKeyStepH('ArrowLeft', false)).toBe(-1)
    expect(missionKeyStepH('ArrowUp', false)).toBe(1)
    expect(missionKeyStepH('ArrowDown', false)).toBe(-1)
  })

  it('steps ±24 h when Shift is held', () => {
    expect(missionKeyStepH('ArrowRight', true)).toBe(24)
    expect(missionKeyStepH('ArrowLeft', true)).toBe(-24)
    expect(missionKeyStepH('ArrowUp', true)).toBe(24)
    expect(missionKeyStepH('ArrowDown', true)).toBe(-24)
  })

  it('steps to extremes on Home and End keys', () => {
    expect(missionKeyStepH('Home', false)).toBe(-1e6)
    expect(missionKeyStepH('End', false)).toBe(1e6)
  })

  it('returns null for non-arrow keys', () => {
    expect(missionKeyStepH('Enter', false)).toBeNull()
    expect(missionKeyStepH('Space', true)).toBeNull()
    expect(missionKeyStepH('Tab', false)).toBeNull()
    expect(missionKeyStepH('a', false)).toBeNull()
  })
})

describe('evaluateMissionRulesAt', () => {
  const meta = {
    contract_version: '1.1.1',
    generated_utc: '2026-11-14T00:00:00Z',
    generator: 'test',
    synthetic: false,
    approximate: false,
    inputs: [],
  }

  const horizon: HorizonFile = {
    meta,
    site_id: 'test_site',
    az_step_deg: 1,
    n: 360,
    observer_heights_m: [2],
    masks: { '2': new Array(360).fill(0) }, // flat 0 deg horizon
  }

  // 100 hourly samples starting at 2027-01-01T00:00:00Z
  const startMs = Date.parse('2027-01-01T00:00:00Z')
  const count = 100

  function createBundle(opts: {
    sunEl?: number[]
    earthEl?: number[]
  }) {
    const sunEl = opts.sunEl ?? new Array(count).fill(5) // 5 deg above horizon = visible
    const earthEl = opts.earthEl ?? new Array(count).fill(20) // 20 deg above horizon = visible
    const ephem: EphemFile = {
      meta,
      site_id: 'test_site',
      start_utc: '2027-01-01T00:00:00Z',
      step_minutes: 60,
      count,
      sun: {
        az: new Array(count).fill(0),
        el: sunEl,
      },
      earth: {
        az: new Array(count).fill(180),
        el: earthEl,
      },
      sun_ang_radius_deg: 0.25,
      earth_ang_radius_deg: 1.0,
    }
    return { ephem, horizon }
  }

  const baseRules: MissionRules = {
    observerHeightM: 2,
    missionDurationH: 24, // 24 hours
    minPctSunlit: 50,
    maxLongestDarkH: 6,
    earthAtLandingRequired: true,
    minPctEarth: 50,
  }

  it('evaluates rules met when all conditions are satisfied', () => {
    const bundle = createBundle({})
    const res = evaluateMissionRulesAt(bundle, baseRules, startMs)
    expect(res.valid).toBe(true)
    expect(res.color).toBe('green')
    expect(res.label).toBe('Rules met')
    expect(res.failingRule).toBeNull()
  })

  it('fails when Earth is below horizon at landing', () => {
    const earthEl = new Array(count).fill(20)
    earthEl[0] = -5 // below horizon at index 0 (landing time)
    const bundle = createBundle({ earthEl })
    const res = evaluateMissionRulesAt(bundle, baseRules, startMs)
    expect(res.valid).toBe(false)
    expect(res.color).toBe('red')
    expect(res.label).toBe('Rules not met')
    expect(res.failingRule).toBe('Earth at landing')
  })

  it('fails when Sun elevation at landing is below minimum required', () => {
    const rules: MissionRules = {
      ...baseRules,
      minSunElAtLandingDeg: 10,
    }
    // sun is at 5 deg, below 10 deg
    const bundle = createBundle({})
    const res = evaluateMissionRulesAt(bundle, rules, startMs)
    expect(res.valid).toBe(false)
    expect(res.color).toBe('red')
    expect(res.failingRule).toBe('Sun elevation at landing')
  })

  it('fails when min sunlit percentage is not met', () => {
    // 24 samples: only 5 sunlit -> ~20.8%, below minPctSunlit (50%)
    const sunEl = new Array(count).fill(-5)
    for (let i = 0; i < 5; i++) sunEl[i] = 5
    const bundle = createBundle({ sunEl })
    const res = evaluateMissionRulesAt(bundle, baseRules, startMs)
    expect(res.valid).toBe(false)
    expect(res.color).toBe('red')
    expect(res.failingRule).toBe('Min % Sun visible')
  })

  it('fails when longest dark stretch exceeds maximum', () => {
    // 24 samples: 10 hours dark stretch -> exceeds maxLongestDarkH (6)
    const sunEl = new Array(count).fill(5)
    for (let i = 5; i < 16; i++) sunEl[i] = -5 // 11 consecutive dark hours
    const bundle = createBundle({ sunEl })
    const res = evaluateMissionRulesAt(bundle, baseRules, startMs)
    expect(res.valid).toBe(false)
    expect(res.color).toBe('red')
    expect(res.failingRule).toBe('Max dark stretch')
  })

  it('fails when min Earth percentage is not met', () => {
    const earthEl = new Array(count).fill(-5)
    earthEl[0] = 10 // earth at landing met, but overall < 50%
    const bundle = createBundle({ earthEl })
    const res = evaluateMissionRulesAt(bundle, baseRules, startMs)
    expect(res.valid).toBe(false)
    expect(res.color).toBe('red')
    expect(res.failingRule).toBe('Min % Earth in view')
  })

  it('fails when landing interval is outside data coverage', () => {
    const bundle = createBundle({})
    // 100 samples = 99 hours of coverage. Asking for landing at 90 h with 24 h duration extends to 114 h (outside coverage)
    const lateLandingMs = startMs + 90 * 3600_000
    const res = evaluateMissionRulesAt(bundle, baseRules, lateLandingMs)
    expect(res.valid).toBe(false)
    expect(res.color).toBe('red')
    expect(res.failingRule).toBe('Outside data range')
  })

  it('matches finder.ts exactly across sample boundaries including last valid and first invalid', () => {
    const bundle = createBundle({})
    const windows = findWindows(bundle, baseRules)
    expect(windows.length).toBeGreaterThan(0)

    const n = Math.round(baseRules.missionDurationH) // 24 samples
    const lastValidK = count - n // 100 - 24 = 76
    const firstInvalidK = lastValidK + 1 // 77

    // Helper checking whether timestamp falls in finder windows
    const isInsideFinder = (ms: number): boolean => {
      return windows.some((w) => {
        const wStart = Date.parse(w.start_utc)
        const wEnd = Date.parse(w.end_utc)
        return ms >= wStart && ms <= wEnd
      })
    }

    // Check multiple candidate starts
    const testCases = [0, 5, 20, 50, lastValidK, firstInvalidK, 90]
    for (const k of testCases) {
      const candidateMs = startMs + k * 3600_000
      const evalRes = evaluateMissionRulesAt(bundle, baseRules, candidateMs)
      const expectedValid = isInsideFinder(candidateMs)
      expect(evalRes.valid).toBe(expectedValid)
    }

    // Last valid start (k = count - n = 76)
    const lastValidMs = startMs + lastValidK * 3600_000
    const lastRes = evaluateMissionRulesAt(bundle, baseRules, lastValidMs)
    expect(lastRes.valid).toBe(true)
    expect(isInsideFinder(lastValidMs)).toBe(true)

    // First invalid start (k = count - n + 1 = 77)
    const firstInvalidMs = startMs + firstInvalidK * 3600_000
    const invalidRes = evaluateMissionRulesAt(bundle, baseRules, firstInvalidMs)
    expect(invalidRes.valid).toBe(false)
    expect(invalidRes.failingRule).toBe('Outside data range')
    expect(isInsideFinder(firstInvalidMs)).toBe(false)

    // Dragging non-integer position rounds to nearest sample and does not flash red
    const draggingMidSampleMs = startMs + 10.3 * 3600_000
    const dragRes = evaluateMissionRulesAt(bundle, baseRules, draggingMidSampleMs)
    expect(dragRes.valid).toBe(true)
  })
})

describe('missionBarLabel', () => {
  it('keeps the long form when there is room', () => {
    expect(missionBarLabel(false, 'Min % Sun visible', true, 400)).toBe('Rules not met: Min % Sun visible')
    expect(missionBarLabel(true, null, true, 10)).toBe('Rules met')
  })

  it('shortens step by step so the text never overflows the room', () => {
    expect(missionBarLabel(false, 'Min % Sun visible', false, 150)).toBe('Fail: Min % Sun visible')
    expect(missionBarLabel(false, 'Min % Sun visible', false, 100)).toBe('Fail')
    expect(missionBarLabel(false, 'Min % Sun visible', true, 100)).toBe('Rules not met')
    expect(missionBarLabel(false, 'Min % Sun visible', true, 20)).toBe('Fail')
  })
})
