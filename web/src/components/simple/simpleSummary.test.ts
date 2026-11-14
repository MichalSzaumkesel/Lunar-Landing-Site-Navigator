import { describe, expect, it } from 'vitest'
import { HOUR_MS } from '../../config/dataRange'
import type { SkyEvent } from '../../lib/events'
import {
  formatCountdown,
  formatDay,
  formatHoursWithDays,
  formatWindowPlain,
  outOfRangeMessage,
  simpleStatus,
} from './simpleSummary'
import type { SimpleStatusInput } from './simpleSummary'

function makeEvent(kind: SkyEvent['kind'], ms: number): SkyEvent {
  return { kind, ms, utc: new Date(ms).toISOString() }
}

const baseInput: SimpleStatusInput = {
  sunVisible: true,
  earthVisible: true,
  cursorMs: 1_000_000,
  durationH: 720,
  nextSunEvent: makeEvent('sunset', 1_000_000 + 31 * HOUR_MS),
  nextEarthEvent: makeEvent('earthset', 1_000_000 + 31 * HOUR_MS),
  metrics: { pct_sunlit: 49.2, longest_dark_h: 355.1, pct_earth: 36.4 },
  synthetic: false,
}

describe('formatHoursWithDays / formatCountdown', () => {
  it('adds days from 48 hours and uses singular for 1 hour', () => {
    expect(formatHoursWithDays(1)).toBe('1 hour')
    expect(formatHoursWithDays(47.6)).toBe('48 hours, about 2 days')
    expect(formatHoursWithDays(355.1)).toBe('355 hours, about 15 days')
  })

  it('says less than an hour under 30 minutes', () => {
    expect(formatCountdown(0.4)).toBe('less than an hour')
    expect(formatCountdown(31)).toBe('31 hours')
  })
})

describe('date helpers', () => {
  it('formats days and windows without ISO strings', () => {
    expect(formatDay('2027-10-06')).toBe('Oct 6, 2027')
    expect(formatWindowPlain(Date.parse('2027-10-06T00:00:00Z'), Date.parse('2027-11-05T00:00:00Z'))).toBe(
      'Oct 6 – Nov 5, 2027',
    )
    expect(formatWindowPlain(Date.parse('2027-12-20T00:00:00Z'), Date.parse('2028-01-19T00:00:00Z'))).toBe(
      'Dec 20, 2027 – Jan 19, 2028',
    )
  })

  it('states the bounds of the data range', () => {
    expect(outOfRangeMessage('2026-12-01', '2028-12-01')).toBe(
      'We only have data from Dec 1, 2026 to Dec 1, 2028. Pick a start date in that range.',
    )
  })
})

describe('simpleStatus', () => {
  it('shows two matching blocks with countdowns and three window rows', () => {
    const s = simpleStatus(baseInput)
    expect(s.blocks).toEqual([
      { id: 'sun', on: true, headline: 'Sun visible', detail: 'It sets in 31 hours.' },
      { id: 'earth', on: true, headline: 'Earth in view', detail: 'It sets in 31 hours.' },
    ])
    expect(s.rows.map((r) => r.value)).toEqual(['49% of 30 days', '15 days', '36% of 30 days'])
    expect(s.note).toBeNull()
  })

  it('shows sunrise and Earth rise when both are below the horizon', () => {
    const s = simpleStatus({
      ...baseInput,
      sunVisible: false,
      earthVisible: false,
      nextSunEvent: makeEvent('sunrise', 1_000_000 + 53 * HOUR_MS),
      nextEarthEvent: makeEvent('earthrise', 1_000_000 + 52 * HOUR_MS),
    })
    expect(s.blocks[0]).toMatchObject({ on: false, headline: 'Sun below the horizon', detail: 'It rises in 53 hours, about 2 days.' })
    expect(s.blocks[1]).toMatchObject({ on: false, headline: 'Earth below the horizon', detail: 'It rises in 52 hours, about 2 days.' })
  })

  it('says plainly when nothing changes in the data window', () => {
    const lit = simpleStatus({ ...baseInput, nextSunEvent: null, nextEarthEvent: null })
    expect(lit.blocks.map((b) => b.detail)).toEqual([
      'No sunset in the data window.',
      'No Earthset in the data window.',
    ])
    const dark = simpleStatus({ ...baseInput, sunVisible: false, earthVisible: false, nextSunEvent: null, nextEarthEvent: null })
    expect(dark.blocks.map((b) => b.detail)).toEqual([
      'No sunrise in the data window.',
      'No Earthrise in the data window.',
    ])
  })

  it('uses plain window and dark spans for short windows', () => {
    const s = simpleStatus({
      ...baseInput,
      durationH: 6,
      metrics: { pct_sunlit: 100, longest_dark_h: 1, pct_earth: 0 },
    })
    expect(s.rows.map((r) => r.value)).toEqual([
      '100% of the next few hours',
      '1 hour',
      '0% of the next few hours',
    ])
    expect(simpleStatus({ ...baseInput, durationH: 24 }).rows[0].value).toBe('49% of 1 day')
  })

  it('adds the demo data note for synthetic data', () => {
    expect(simpleStatus({ ...baseInput, synthetic: true }).note).toBe('This is demo data, not a measurement.')
  })

  it('never claims power, energy, signal, link or radio contact', () => {
    const texts = [true, false].flatMap((v) => {
      const s = simpleStatus({ ...baseInput, sunVisible: v, earthVisible: v })
      return [...s.blocks.flatMap((b) => [b.headline, b.detail]), ...s.rows.map((r) => `${r.label} ${r.value}`)]
    })
    expect(texts.join(' ')).not.toMatch(/power|energy|signal|link|radio|CLPS|UTC/i)
  })
})
