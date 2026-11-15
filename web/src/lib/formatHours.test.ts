import { describe, expect, it } from 'vitest'
import { formatCursorH } from './formatHours'

describe('formatCursorH', () => {
  it('shows whole hours without decimals', () => {
    expect(formatCursorH(0)).toBe('0')
    expect(formatCursorH(576)).toBe('576')
  })
  it('keeps the 0.25 h steps distinguishable', () => {
    expect([576, 576.25, 576.5, 576.75, 577].map(formatCursorH)).toEqual(['576', '576.25', '576.5', '576.75', '577'])
  })
  it('absorbs float noise', () => {
    expect(formatCursorH(0.1 + 0.2)).toBe('0.3')
    expect(formatCursorH(12.000000001)).toBe('12')
  })
})
