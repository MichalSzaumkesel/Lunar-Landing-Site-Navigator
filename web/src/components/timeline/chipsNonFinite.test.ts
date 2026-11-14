import { describe, expect, it } from 'vitest'
import { eclipseChip, eventChip, fmtChipTime, stretchChip } from './chips'

describe('chip formatters with invalid times', () => {
  it('fmtChipTime returns "Not available" instead of throwing', () => {
    expect(fmtChipTime(NaN)).toBe('Not available')
    expect(fmtChipTime(Infinity)).toBe('Not available')
    expect(fmtChipTime(8.64e15 + 1)).toBe('Not available')
  })

  it('fmtChipTime is unchanged for valid times', () => {
    expect(fmtChipTime(Date.UTC(2027, 8, 3, 14, 20))).toBe('09-03 14:20')
  })

  it('event, stretch and eclipse chips build without NaN text', () => {
    const e = eventChip({ kind: 'sunset', ms: NaN, utc: '' })
    expect(e.timeText).toBe('Not available')
    expect(e.tip).not.toMatch(/NaN|Invalid/)
    const s = stretchChip({ kind: 'longest_dark', startMs: NaN, endMs: NaN, hours: 3 })
    expect(s.timeText).toBe('Not available')
    expect(s.tip).not.toMatch(/NaN|Invalid/)
    expect(eclipseChip({ startMs: NaN, endMs: NaN, maxOverlapFraction: 0, minSeparationDeg: 0 }).timeText).toBe(
      'Not available',
    )
  })
})
