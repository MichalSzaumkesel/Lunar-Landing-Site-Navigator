import { describe, expect, it } from 'vitest'
import {
  chooseTier,
  isLower,
  medianMs,
  MIN_BENCHMARK_FRAMES,
  parseTierOverride,
  TIERS,
  tierForFrameMs,
  tierForIntervalMs,
} from './quality'

describe('frame interval tier', () => {
  it('keeps high for vsync intervals and lowers the tier for slow intervals', () => {
    expect(tierForIntervalMs(16.7)).toBe('high')
    expect(tierForIntervalMs(25)).toBe('medium')
    expect(tierForIntervalMs(40)).toBe('low')
  })
})

describe('tier choice', () => {
  it('maps frame time to a tier', () => {
    expect(tierForFrameMs(3)).toBe('high')
    expect(tierForFrameMs(14)).toBe('high')
    expect(tierForFrameMs(20)).toBe('medium')
    expect(tierForFrameMs(30)).toBe('medium')
    expect(tierForFrameMs(45)).toBe('low')
  })

  it('uses the median, so one slow frame does not decide', () => {
    expect(medianMs([5, 5, 6, 5, 400])).toBe(5)
    expect(medianMs([1, 2, 3, 4])).toBe(2.5)
    expect(medianMs([])).toBe(0)
    expect(chooseTier(null, [5, 5, 6, 5, 400, 5, 5, 6])).toBe('high')
  })

  it('an override always wins', () => {
    expect(chooseTier('low', [1, 1, 1, 1, 1, 1, 1, 1])).toBe('low')
    expect(chooseTier('high', [90, 90, 90])).toBe('high')
  })

  it('falls back to low when the machine produced too few samples', () => {
    expect(chooseTier(null, new Array(MIN_BENCHMARK_FRAMES - 1).fill(4))).toBe('low')
  })

  it('only ever lowers the tier', () => {
    expect(isLower('low', 'high')).toBe(true)
    expect(isLower('medium', 'high')).toBe(true)
    expect(isLower('high', 'medium')).toBe(false)
    expect(isLower('low', 'low')).toBe(false)
  })

  it('lower tiers lower every cost', () => {
    const { high, medium, low } = TIERS
    for (const key of [
      'farShadowMap',
      'nearShadowMap',
      'smallRocks',
      'boulders',
      'craters',
      'detailTexSize',
      'stars',
    ] as const) {
      expect(high[key]).toBeGreaterThanOrEqual(medium[key])
      expect(medium[key]).toBeGreaterThanOrEqual(low[key])
    }
    expect(high.glare).toBe(true)
    expect(low.glare).toBe(false)
  })
})

describe('parseTierOverride', () => {
  it('reads q from the query string', () => {
    expect(parseTierOverride('?q=low', '')).toBe('low')
    expect(parseTierOverride('?tour=0&q=medium', '')).toBe('medium')
  })

  it('reads q from the hash', () => {
    expect(parseTierOverride('', '#m=a&q=high&s=x')).toBe('high')
  })

  it('ignores unknown values and other keys', () => {
    expect(parseTierOverride('?q=ultra', '')).toBeNull()
    expect(parseTierOverride('?quality=low', '#sq=low')).toBeNull()
    expect(parseTierOverride('', '')).toBeNull()
  })
})
