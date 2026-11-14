import { HOUR_MS } from '../../config/dataRange'
import type { SkyEvent } from '../../lib/events'
import type { ScenarioMetrics } from '../../lib/types'

export interface SimpleSummaryInput {
  inCoverage: boolean
  sunVisible: boolean
  earthVisible: boolean
  nextSunEvent?: SkyEvent | null
  nextEarthEvent?: SkyEvent | null
  cursorMs: number
  durationH: number
  metrics: Pick<ScenarioMetrics, 'pct_sunlit' | 'longest_dark_h' | 'pct_earth'>
  synthetic?: boolean
}

/**
 * Formats a duration in hours into plain English.
 * Hours above 48 are also given in days.
 */
export function formatHoursWithDays(rawHours: number): string {
  const h = Math.round(Math.max(0, rawHours))
  if (h >= 48) {
    const days = Math.round(h / 24)
    const daysText = days === 1 ? 'about 1 day' : `about ${days} days`
    return `${h} hours, ${daysText}`
  }
  if (h === 1) {
    return '1 hour'
  }
  return `${h} hours`
}

/**
 * Formats an event countdown duration in hours into plain English.
 * Durations under 30 minutes say "less than an hour".
 */
export function formatCountdown(rawHours: number): string {
  const diffH = Math.max(0, rawHours)
  if (diffH < 0.5) {
    return 'less than an hour'
  }
  return formatHoursWithDays(diffH)
}

/**
 * Generates an array of short plain sentences describing the active lunar site conditions.
 */
export function simpleSummary(input: SimpleSummaryInput): string[] {
  if (!input.inCoverage) {
    return ['This date is outside the data we have.']
  }

  // Sentence 1: Sun now
  const s1 = input.sunVisible
    ? 'The Sun is above the horizon.'
    : "The Sun is below the horizon: the terrain or the Moon's curve hides it."

  // Sentence 2: Next change for the Sun
  let s2: string
  if (input.nextSunEvent) {
    const diffH = Math.max(0, (input.nextSunEvent.ms - input.cursorMs) / HOUR_MS)
    const verb = input.nextSunEvent.kind === 'sunset' ? 'sets' : 'rises'
    s2 = `It ${verb} in ${formatCountdown(diffH)}.`
  } else {
    s2 = input.sunVisible ? 'It does not set in the data.' : 'It does not rise in the data.'
  }

  // Sentence 3: Earth now plus its next change
  const earthNow = input.earthVisible ? 'Earth is in view.' : 'Earth is hidden below the horizon.'
  let earthNext: string
  if (input.nextEarthEvent) {
    const diffH = Math.max(0, (input.nextEarthEvent.ms - input.cursorMs) / HOUR_MS)
    const verb = input.nextEarthEvent.kind === 'earthset' ? 'sets' : 'rises'
    earthNext = `It ${verb} in ${formatCountdown(diffH)}.`
  } else {
    earthNext = input.earthVisible ? 'It does not set in the data.' : 'It does not rise in the data.'
  }
  const s3 = `${earthNow} ${earthNext}`

  // Sentence 4: Sun over the window
  let windowPhrase: string
  if (input.durationH < 12) {
    windowPhrase = 'these few hours'
  } else {
    const days = Math.round(input.durationH / 24)
    windowPhrase = days === 1 ? 'this 1 day' : `these ${days} days`
  }
  const pctSun = Math.round(input.metrics.pct_sunlit)
  const s4 = `Over ${windowPhrase} the Sun is visible ${pctSun}% of the time.`

  // Sentence 5: Longest dark stretch
  const s5 = `The longest dark stretch is ${formatHoursWithDays(input.metrics.longest_dark_h)}.`

  // Sentence 6: Earth over the window
  const pctEarth = Math.round(input.metrics.pct_earth)
  const s6 = `Earth is in view ${pctEarth}% of the time.`

  const sentences = [s1, s2, s3, s4, s5, s6]
  if (input.synthetic) {
    sentences.push('This is demo data, not a measurement.')
  }

  return sentences
}
