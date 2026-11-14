import { describe, expect, it } from 'vitest'
import type { Eclipse } from '../../lib/eclipses'
import type { SkyEvent, SkyStretch } from '../../lib/events'
import { MAX_CHIPS, eclipseChip, eventChip, eventsInWindow, fmtChipTime, selectChips, stretchChip } from './chips'

const H = 3_600_000
const T0 = Date.UTC(2027, 8, 3, 14, 20)
const ev = (kind: SkyEvent['kind'], ms: number): SkyEvent => ({ kind, ms, utc: new Date(ms).toISOString() })

describe('chip text', () => {
  it('formats the UTC time as month-day hour:minute', () => {
    expect(fmtChipTime(T0)).toBe('09-03 14:20')
  })

  it('builds an event chip with a definition tooltip', () => {
    const c = eventChip(ev('earthset', T0))
    expect(c.label).toBe('Earthset')
    expect(c.timeText).toBe('09-03 14:20')
    expect(c.ms).toBe(T0)
    expect(c.tip).toContain('2027-09-03 14:20 UTC')
    expect(c.tip).toContain('Earth centre goes from above to below')
  })

  it('builds stretch chips with the length', () => {
    const dark: SkyStretch = { kind: 'longest_dark', startMs: T0, endMs: T0 + 132 * H, hours: 132 }
    const noEarth: SkyStretch = { kind: 'longest_no_earth', startMs: T0, endMs: T0 + 5.5 * H, hours: 5.5 }
    expect(stretchChip(dark).label).toBe('Longest dark stretch 132 h')
    expect(stretchChip(noEarth).label).toBe('Longest without Earth 5.5 h')
    expect(stretchChip(dark).ms).toBe(T0)
  })

  it('builds an eclipse chip with the correct label, formatted start time and tooltip', () => {
    const eclipse: Eclipse = {
      startMs: T0,
      endMs: T0 + 5 * H,
      maxOverlapFraction: 0.8,
      minSeparationDeg: 0.3,
    }
    const c = eclipseChip(eclipse)
    expect(c.id).toBe(`eclipse-${T0}`)
    expect(c.label).toBe('Earth in front of the Sun')
    expect(c.timeText).toBe('09-03 14:20')
    expect(c.ms).toBe(T0)
    expect(c.tip).toBe(
      "Geometric overlap of the Earth and Sun discs seen from this site; terrain and Earth's atmosphere are not modelled.",
    )
  })
})

describe('eventsInWindow', () => {
  const list = [ev('sunset', 10), ev('sunrise', 20), ev('sunset', 30), ev('sunrise', 40)]
  it('takes the half-open window', () => {
    expect(eventsInWindow(list, 20, 40).map((e) => e.ms)).toEqual([20, 30])
    expect(eventsInWindow(list, 0, 100)).toHaveLength(4)
    expect(eventsInWindow(list, 41, 100)).toEqual([])
    expect(eventsInWindow([], 0, 100)).toEqual([])
  })
})

describe('selectChips', () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => eventChip(ev(i % 2 ? 'sunrise' : 'sunset', T0 + i * H)))
  const stretches = [
    stretchChip({ kind: 'longest_dark', startMs: T0, endMs: T0 + H, hours: 1 }),
    stretchChip({ kind: 'longest_no_earth', startMs: T0, endMs: T0 + H, hours: 1 }),
  ]

  it('shows everything up to the limit', () => {
    const set = selectChips(mk(6), stretches, false)
    expect(set.shown).toHaveLength(8)
    expect(set.hidden).toBe(0)
  })

  it('folds later events into a count above the limit', () => {
    const set = selectChips(mk(20), stretches, false)
    expect(set.shown).toHaveLength(MAX_CHIPS)
    expect(set.hidden).toBe(14)
    expect(set.shown.slice(-2)).toEqual(stretches)
  })

  it('shows all when expanded', () => {
    const set = selectChips(mk(20), stretches, true)
    expect(set.shown).toHaveLength(22)
    expect(set.hidden).toBe(0)
  })
})
