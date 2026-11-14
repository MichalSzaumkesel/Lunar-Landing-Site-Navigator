import { describe, expect, it } from 'vitest'
import { SPEEDS_H_PER_SEC } from '../config/presets'
import { formatSpeed } from './speedLabel'

describe('formatSpeed', () => {
  it('uses singular for one', () => {
    expect(formatSpeed(1)).toBe('1 hour per second')
    expect(formatSpeed(24)).toBe('1 day per second')
  })
  it('uses plural otherwise', () => {
    expect(formatSpeed(6)).toBe('6 hours per second')
    expect(formatSpeed(12)).toBe('12 hours per second')
    expect(formatSpeed(72)).toBe('3 days per second')
    expect(formatSpeed(168)).toBe('7 days per second')
  })
  it('has a compact spelled form', () => {
    expect(formatSpeed(12, true)).toBe('12 hours / s')
    expect(formatSpeed(24, true)).toBe('1 day / s')
  })
  it('never abbreviates units', () => {
    for (const v of SPEEDS_H_PER_SEC) expect(formatSpeed(v, true)).toMatch(/hours?|days?/)
  })
})
