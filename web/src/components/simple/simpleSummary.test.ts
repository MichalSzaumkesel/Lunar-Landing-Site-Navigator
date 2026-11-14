import { describe, expect, it } from 'vitest'
import { HOUR_MS } from '../../config/dataRange'
import type { SkyEvent } from '../../lib/events'
import { formatHoursWithDays, simpleSummary } from './simpleSummary'
import type { SimpleSummaryInput } from './simpleSummary'

function makeEvent(kind: SkyEvent['kind'], ms: number): SkyEvent {
  return {
    kind,
    ms,
    utc: new Date(ms).toISOString(),
  }
}

const baseMetrics = {
  pct_sunlit: 49.2,
  longest_dark_h: 355.1,
  pct_earth: 36.4,
}

const baseInput: SimpleSummaryInput = {
  inCoverage: true,
  sunVisible: true,
  earthVisible: true,
  cursorMs: 1_000_000,
  durationH: 720, // 30 days
  nextSunEvent: makeEvent('sunset', 1_000_000 + 31 * HOUR_MS),
  nextEarthEvent: makeEvent('earthset', 1_000_000 + 31 * HOUR_MS),
  metrics: baseMetrics,
  synthetic: false,
}

describe('formatHoursWithDays', () => {
  it('formats hours < 48 as integer hours, and >= 48 with days', () => {
    expect(formatHoursWithDays(0)).toBe('0 hours')
    expect(formatHoursWithDays(0.4)).toBe('0 hours')
    expect(formatHoursWithDays(1)).toBe('1 hour')
    expect(formatHoursWithDays(12.3)).toBe('12 hours')
    expect(formatHoursWithDays(47)).toBe('47 hours')
    expect(formatHoursWithDays(48)).toBe('48 hours, about 2 days')
    expect(formatHoursWithDays(49)).toBe('49 hours, about 2 days')
    expect(formatHoursWithDays(72)).toBe('72 hours, about 3 days')
    expect(formatHoursWithDays(355)).toBe('355 hours, about 15 days')
  })
})

describe('simpleSummary', () => {
  it('returns single outside-range sentence when not in coverage', () => {
    const res = simpleSummary({ ...baseInput, inCoverage: false })
    expect(res).toEqual(['This date is outside the data we have.'])
  })

  it('matches the exact brief examples for standard South Pole conditions', () => {
    const res = simpleSummary(baseInput)
    expect(res).toEqual([
      'The Sun is above the horizon.',
      'It sets in 31 hours.',
      'Earth is in view. It sets in 31 hours.',
      'Over these 30 days the Sun is visible 49% of the time.',
      'The longest dark stretch is 355 hours, about 15 days.',
      'Earth is in view 36% of the time.',
    ])
  })

  it('handles Sun below horizon and next sunrise', () => {
    const res = simpleSummary({
      ...baseInput,
      sunVisible: false,
      nextSunEvent: makeEvent('sunrise', 1_000_000 + 12 * HOUR_MS),
    })
    expect(res[0]).toBe("The Sun is below the horizon: the terrain or the Moon's curve hides it.")
    expect(res[1]).toBe('It rises in 12 hours.')
  })

  it('handles Sun never setting or rising in the data', () => {
    const resSunlit = simpleSummary({
      ...baseInput,
      sunVisible: true,
      nextSunEvent: null,
    })
    expect(resSunlit[1]).toBe('It does not set in the data.')

    const resDark = simpleSummary({
      ...baseInput,
      sunVisible: false,
      nextSunEvent: null,
    })
    expect(resDark[1]).toBe('It does not rise in the data.')
  })

  it('handles Earth hidden below horizon and rising', () => {
    const res = simpleSummary({
      ...baseInput,
      earthVisible: false,
      nextEarthEvent: makeEvent('earthrise', 1_000_000 + 12 * HOUR_MS),
    })
    expect(res[2]).toBe('Earth is hidden below the horizon. It rises in 12 hours.')
  })

  it('handles Earth never setting or rising in data', () => {
    const resEarthUp = simpleSummary({
      ...baseInput,
      earthVisible: true,
      nextEarthEvent: null,
    })
    expect(resEarthUp[2]).toBe('Earth is in view. It does not set in the data.')

    const resEarthDown = simpleSummary({
      ...baseInput,
      earthVisible: false,
      nextEarthEvent: null,
    })
    expect(resEarthDown[2]).toBe('Earth is hidden below the horizon. It does not rise in the data.')
  })

  it('formats next change with hours above 48 and days', () => {
    const res = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunset', 1_000_000 + 72 * HOUR_MS),
      nextEarthEvent: makeEvent('earthset', 1_000_000 + 96 * HOUR_MS),
    })
    expect(res[1]).toBe('It sets in 72 hours, about 3 days.')
    expect(res[2]).toBe('Earth is in view. It sets in 96 hours, about 4 days.')
  })

  it('formats 1 hour transitions in singular', () => {
    const res = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunset', 1_000_000 + 1 * HOUR_MS),
    })
    expect(res[1]).toBe('It sets in 1 hour.')
  })

  it('formats countdowns across boundaries: 0, 0.4, 1, 47, 48, 49 hours', () => {
    // 0 hours (< 30 min)
    const res0 = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunset', 1_000_000),
      nextEarthEvent: makeEvent('earthset', 1_000_000),
    })
    expect(res0[1]).toBe('It sets in less than an hour.')
    expect(res0[2]).toBe('Earth is in view. It sets in less than an hour.')

    // 0.4 hours = 24 minutes (< 30 min)
    const res04 = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunrise', 1_000_000 + 0.4 * HOUR_MS),
      nextEarthEvent: makeEvent('earthrise', 1_000_000 + 0.4 * HOUR_MS),
      sunVisible: false,
      earthVisible: false,
    })
    expect(res04[1]).toBe('It rises in less than an hour.')
    expect(res04[2]).toBe('Earth is hidden below the horizon. It rises in less than an hour.')

    // 1 hour
    const res1 = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunset', 1_000_000 + 1 * HOUR_MS),
      nextEarthEvent: makeEvent('earthset', 1_000_000 + 1 * HOUR_MS),
    })
    expect(res1[1]).toBe('It sets in 1 hour.')
    expect(res1[2]).toBe('Earth is in view. It sets in 1 hour.')

    // 47 hours
    const res47 = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunset', 1_000_000 + 47 * HOUR_MS),
      nextEarthEvent: makeEvent('earthset', 1_000_000 + 47 * HOUR_MS),
    })
    expect(res47[1]).toBe('It sets in 47 hours.')
    expect(res47[2]).toBe('Earth is in view. It sets in 47 hours.')

    // 48 hours
    const res48 = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunset', 1_000_000 + 48 * HOUR_MS),
      nextEarthEvent: makeEvent('earthset', 1_000_000 + 48 * HOUR_MS),
    })
    expect(res48[1]).toBe('It sets in 48 hours, about 2 days.')
    expect(res48[2]).toBe('Earth is in view. It sets in 48 hours, about 2 days.')

    // 49 hours
    const res49 = simpleSummary({
      ...baseInput,
      nextSunEvent: makeEvent('sunrise', 1_000_000 + 49 * HOUR_MS),
      nextEarthEvent: makeEvent('earthrise', 1_000_000 + 49 * HOUR_MS),
      sunVisible: false,
      earthVisible: false,
    })
    expect(res49[1]).toBe('It rises in 49 hours, about 2 days.')
    expect(res49[2]).toBe('Earth is hidden below the horizon. It rises in 49 hours, about 2 days.')
  })

  it('says "Over these few hours" for durations under 12 hours (no "0 days")', () => {
    const res6 = simpleSummary({
      ...baseInput,
      durationH: 6,
      metrics: {
        pct_sunlit: 80,
        longest_dark_h: 1,
        pct_earth: 50,
      },
    })
    expect(res6[3]).toBe('Over these few hours the Sun is visible 80% of the time.')

    const res0 = simpleSummary({
      ...baseInput,
      durationH: 0,
      metrics: {
        pct_sunlit: 0,
        longest_dark_h: 0,
        pct_earth: 0,
      },
    })
    expect(res0[3]).toBe('Over these few hours the Sun is visible 0% of the time.')
  })

  it('handles short window of 1 day and short dark stretch', () => {
    const res = simpleSummary({
      ...baseInput,
      durationH: 24,
      metrics: {
        pct_sunlit: 100,
        longest_dark_h: 0,
        pct_earth: 50,
      },
    })
    expect(res[3]).toBe('Over this 1 day the Sun is visible 100% of the time.')
    expect(res[4]).toBe('The longest dark stretch is 0 hours.')
    expect(res[5]).toBe('Earth is in view 50% of the time.')
  })

  it('appends synthetic demo data note when synthetic is true', () => {
    const res = simpleSummary({
      ...baseInput,
      synthetic: true,
    })
    expect(res).toHaveLength(7)
    expect(res[6]).toBe('This is demo data, not a measurement.')
  })

  it('never outputs forbidden jargon like power, energy, signal or link', () => {
    const forbidden = ['power', 'energy', 'signal', 'link', 'clearance', 'comm']
    const res = simpleSummary({
      ...baseInput,
      synthetic: true,
    })
    const fullText = res.join(' ').toLowerCase()
    for (const word of forbidden) {
      expect(fullText.includes(word)).toBe(false)
    }
  })
})
