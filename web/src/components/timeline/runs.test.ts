import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile } from '../../lib/types'
import {
  NO_DATA,
  OFF,
  ON,
  computeBandRuns,
  computeBandStates,
  dayTicks,
  formatDayLabel,
  formatUtcMinute,
  hoursFromX,
  keyStepH,
  labelStride,
  mergeRuns,
  xFromHours,
} from './runs'

const META = {
  contract_version: '1.1.1',
  generated_utc: '2026-11-14T00:00:00Z',
  generator: 'test',
  synthetic: true,
  approximate: false,
  inputs: [],
}
const H = 3_600_000
const T0 = Date.parse('2026-12-01T00:00:00Z')

function bundle(sunEl: number[], earthEl: number[], horizonDeg = 0) {
  const count = sunEl.length
  const ephem: EphemFile = {
    meta: META,
    site_id: 't',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count,
    sun: { az: sunEl.map(() => 10), el: sunEl },
    earth: { az: earthEl.map(() => 200), el: earthEl },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
  }
  const horizon: HorizonFile = {
    meta: META,
    site_id: 't',
    az_step_deg: 0.5,
    n: 720,
    observer_heights_m: [2],
    masks: { '2': Array.from({ length: 720 }, () => horizonDeg) },
  }
  return { ephem, horizon }
}

describe('mergeRuns', () => {
  it('merges equal neighbours into half-open runs', () => {
    expect(mergeRuns([0, 0, 1, 1, 1, 0, 2, 2])).toEqual([
      { start: 0, end: 2, state: OFF },
      { start: 2, end: 5, state: ON },
      { start: 5, end: 6, state: OFF },
      { start: 6, end: 8, state: NO_DATA },
    ])
  })

  it('handles empty, single and uniform input', () => {
    expect(mergeRuns([])).toEqual([])
    expect(mergeRuns([1])).toEqual([{ start: 0, end: 1, state: ON }])
    expect(mergeRuns(new Uint8Array(5))).toEqual([{ start: 0, end: 5, state: OFF }])
  })

  it('covers every hour exactly once', () => {
    const states = [0, 1, 1, 0, 0, 0, 1, 0, 2, 2, 1]
    const runs = mergeRuns(states)
    expect(runs.reduce((n, r) => n + r.end - r.start, 0)).toBe(states.length)
    expect(runs[0].start).toBe(0)
    expect(runs[runs.length - 1].end).toBe(states.length)
  })
})

describe('computeBandStates', () => {
  it('turns on when the body centre is above the terrain horizon', () => {
    const b = bundle([1, 1, -1, -1], [-1, 1, 1, -1])
    const s = computeBandStates(b, 2, T0, 4)
    expect(Array.from(s.sun)).toEqual([ON, ON, OFF, OFF])
    expect(Array.from(s.earth)).toEqual([OFF, ON, ON, OFF])
    expect(Array.from(s.both)).toEqual([OFF, ON, OFF, OFF])
  })

  it('uses the terrain, not the plane', () => {
    const b = bundle([1, 3], [3, 3], 2)
    const s = computeBandStates(b, 2, T0, 2)
    expect(Array.from(s.sun)).toEqual([OFF, ON])
  })

  it('marks hours outside the coverage as no data in every band', () => {
    const b = bundle([1, 1, 1], [1, 1, 1])
    const s = computeBandStates(b, 2, T0 - 2 * H, 8)
    // Hours -2, -1 are before the coverage; hours 3.. are after the last sample (index 2).
    expect(Array.from(s.sun)).toEqual([2, 2, 1, 1, 1, 2, 2, 2])
    expect(Array.from(s.both)).toEqual(Array.from(s.sun))
    expect(Array.from(s.earth)).toEqual(Array.from(s.sun))
  })

  it('merges into few runs', () => {
    const el = Array.from({ length: 48 }, (_, k) => (k < 12 ? 1 : k < 30 ? -1 : 1))
    const runs = computeBandRuns(bundle(el, el), 2, T0, 48)
    expect(runs.sun).toEqual([
      { start: 0, end: 12, state: ON },
      { start: 12, end: 30, state: OFF },
      { start: 30, end: 48, state: ON },
    ])
  })
})

describe('axis ticks', () => {
  it('lists UTC midnights inside the window', () => {
    const start = Date.parse('2027-08-30T00:00:00Z')
    const ticks = dayTicks(start, start + 3 * 24 * H)
    expect(ticks).toHaveLength(4)
    expect(ticks[0]).toBe(start)
  })

  it('skips the partial first day', () => {
    const start = Date.parse('2027-08-30T06:00:00Z')
    const ticks = dayTicks(start, start + 48 * H)
    expect(ticks.map(formatDayLabel)).toEqual(['Aug 31', 'Sep 1'])
  })

  it('keeps labels apart at 30 and 60 days', () => {
    const plot = 520
    for (const days of [30, 60]) {
      const stride = labelStride(plot / days)
      expect(stride * (plot / days)).toBeGreaterThanOrEqual(56)
    }
    expect(labelStride(520 / 30)).toBe(4)
    expect(labelStride(520 / 60)).toBe(7)
    expect(labelStride(1000)).toBe(1)
  })

  it('formats UTC day labels', () => {
    expect(formatDayLabel(Date.parse('2027-01-05T23:59:00Z'))).toBe('Jan 5')
    expect(formatDayLabel(Date.parse('2027-12-31T00:00:00Z'))).toBe('Dec 31')
  })

  it('formats a cursor time to the minute', () => {
    expect(formatUtcMinute(Date.parse('2027-08-30T05:00:00Z'))).toBe('2027-08-30 05:00 UTC')
  })
})

describe('pointer mapping', () => {
  it('maps x to hours and clamps to the window', () => {
    expect(hoursFromX(112, 112, 500, 720)).toBe(0)
    expect(hoursFromX(362, 112, 500, 720)).toBeCloseTo(360)
    expect(hoursFromX(612, 112, 500, 720)).toBeCloseTo(720)
    expect(hoursFromX(0, 112, 500, 720)).toBe(0)
    expect(hoursFromX(900, 112, 500, 720)).toBe(720)
  })

  it('round-trips with xFromHours', () => {
    for (const h of [0, 13.5, 360, 720]) {
      expect(hoursFromX(xFromHours(h, 112, 500, 720), 112, 500, 720)).toBeCloseTo(h)
    }
  })

  it('is safe for a zero-width plot', () => {
    expect(hoursFromX(50, 0, 0, 720)).toBe(0)
  })
})

describe('keyStepH', () => {
  it('moves 1 hour, or 24 with Shift', () => {
    expect(keyStepH('ArrowRight', false)).toBe(1)
    expect(keyStepH('ArrowLeft', false)).toBe(-1)
    expect(keyStepH('ArrowRight', true)).toBe(24)
    expect(keyStepH('ArrowLeft', true)).toBe(-24)
  })

  it('jumps to ends on Home and End keys', () => {
    expect(keyStepH('Home', false)).toBe(-1e6)
    expect(keyStepH('End', false)).toBe(1e6)
  })

  it('ignores other keys', () => {
    expect(keyStepH('a', false)).toBeNull()
    expect(keyStepH('Enter', true)).toBeNull()
  })
})
