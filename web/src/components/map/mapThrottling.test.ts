import { describe, expect, it } from 'vitest'
import {
  MIN_REAL_INTERVAL_MS,
  MIN_SIMULATED_STEP_MS,
  shouldRecomputeShading,
} from './mapThrottling'

describe('shouldRecomputeShading', () => {
  const BASE_SIM = 1_700_000_000_000
  const BASE_REAL = 10_000

  it('triggers on initial computation when lastSimMs is null', () => {
    expect(shouldRecomputeShading(BASE_SIM, BASE_REAL, null, BASE_REAL)).toBe(true)
  })

  it('triggers on initial computation when lastRealMs is null', () => {
    expect(shouldRecomputeShading(BASE_SIM, BASE_REAL, BASE_SIM, null)).toBe(true)
  })

  it('triggers when both simulated time and real time thresholds are satisfied', () => {
    const currentSim = BASE_SIM + MIN_SIMULATED_STEP_MS
    const currentReal = BASE_REAL + MIN_REAL_INTERVAL_MS
    expect(
      shouldRecomputeShading(currentSim, currentReal, BASE_SIM, BASE_REAL),
    ).toBe(true)
  })

  it('does not trigger when simulated delta is >= 15m but real time < 250ms (fast playback)', () => {
    const currentSim = BASE_SIM + MIN_SIMULATED_STEP_MS * 2
    const currentReal = BASE_REAL + 100 // only 100 ms elapsed
    expect(
      shouldRecomputeShading(currentSim, currentReal, BASE_SIM, BASE_REAL),
    ).toBe(false)
  })

  it('does not trigger when real time >= 250ms but simulated delta < 15m (slow playback)', () => {
    const currentSim = BASE_SIM + 5 * 60 * 1000 // only 5 min elapsed
    const currentReal = BASE_REAL + 500 // 500 ms elapsed
    expect(
      shouldRecomputeShading(currentSim, currentReal, BASE_SIM, BASE_REAL),
    ).toBe(false)
  })

  it('does not trigger when neither threshold is satisfied', () => {
    const currentSim = BASE_SIM + 1_000
    const currentReal = BASE_REAL + 50
    expect(
      shouldRecomputeShading(currentSim, currentReal, BASE_SIM, BASE_REAL),
    ).toBe(false)
  })

  it('handles backwards scrubbing (negative simulated delta)', () => {
    const currentSim = BASE_SIM - MIN_SIMULATED_STEP_MS
    const currentReal = BASE_REAL + MIN_REAL_INTERVAL_MS
    expect(
      shouldRecomputeShading(currentSim, currentReal, BASE_SIM, BASE_REAL),
    ).toBe(true)
  })

  it('honors custom threshold parameters', () => {
    const customSim = 60_000 // 1 min
    const customReal = 100 // 100 ms
    expect(
      shouldRecomputeShading(
        BASE_SIM + 60_000,
        BASE_REAL + 100,
        BASE_SIM,
        BASE_REAL,
        customSim,
        customReal,
      ),
    ).toBe(true)
    expect(
      shouldRecomputeShading(
        BASE_SIM + 50_000,
        BASE_REAL + 100,
        BASE_SIM,
        BASE_REAL,
        customSim,
        customReal,
      ),
    ).toBe(false)
  })
})
