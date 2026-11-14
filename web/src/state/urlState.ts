import type { ObserverHeightM } from '../lib/types'
import type { Mode } from './types'
import { MAX_SCENARIOS, MAX_SLIP_DAYS } from '../config/dataRange'
import { SPEEDS_H_PER_SEC } from '../config/presets'

export interface UrlState {
  mode: Mode
  observerHeightM: ObserverHeightM
  scenarios: Array<{
    siteId: string
    startUtc: string
    durationH: number
    slipDays: number
  }>
  cursorH: number
  speedHPerSec: number
}

function isValidCalendarDate(dateStr: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return false
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/** Date only when the time is midnight (short links), otherwise `YYYY-MM-DDTHH:MM:SSZ`. */
function encodeStart(startUtc: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?Z$/.exec(startUtc)
  if (!match) return startUtc.slice(0, 10)
  return match[2] === '00:00:00' ? match[1] : `${match[1]}T${match[2]}Z`
}

/** Parses `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ` into a canonical UTC string, or null. */
function decodeStart(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})Z)?$/.exec(value)
  if (!match || !isValidCalendarDate(match[1])) return null
  const [, date, hh = '00', mm = '00', ss = '00'] = match
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null
  return `${date}T${hh}:${mm}:${ss}Z`
}

/** Returns the hash string without the leading '#'. */
export function encodeState(s: UrlState): string {
  const parts: string[] = []

  // mode
  parts.push(`m=${s.mode === 'simple' ? 's' : 'a'}`)

  // observerHeightM
  parts.push(`h=${s.observerHeightM}`)

  // cursorH rounded to 0.1
  const roundedCursor = Math.round(s.cursorH * 10) / 10
  const safeCursor = Object.is(roundedCursor, -0) ? 0 : roundedCursor
  parts.push(`c=${safeCursor}`)

  // speedHPerSec
  parts.push(`v=${s.speedHPerSec}`)

  // scenarios
  if (s.scenarios && s.scenarios.length > 0) {
    const scList = s.scenarios.slice(0, MAX_SCENARIOS).map((sc) => {
      const start = encodeStart(sc.startUtc)
      const dur = Math.round(sc.durationH)
      const slip = Math.round(sc.slipDays)
      return `${sc.siteId}~${start}~${dur}~${slip}`
    })
    parts.push(`s=${scList.join(';')}`)
  }

  return parts.join('&')
}

/** Tolerant: invalid parts are dropped, never throws. */
export function decodeState(hash: string): Partial<UrlState> {
  const result: Partial<UrlState> = {}
  if (!hash) return result

  try {
    let clean = hash.trim()
    if (clean.startsWith('#')) {
      clean = clean.slice(1)
    }
    if (!clean) return result

    const params = new URLSearchParams(clean)

    // mode: must be 's' or 'a'
    const m = params.get('m')
    if (m === 's') {
      result.mode = 'simple'
    } else if (m === 'a') {
      result.mode = 'advanced'
    }

    // observerHeightM: must be 2 or 10
    const h = params.get('h')
    if (h === '2') {
      result.observerHeightM = 2
    } else if (h === '10') {
      result.observerHeightM = 10
    }

    // cursorH: finite number >= 0
    const cStr = params.get('c')
    if (cStr !== null && cStr !== '') {
      const c = Number(cStr)
      if (Number.isFinite(c) && c >= 0) {
        result.cursorH = c
      }
    }

    // speed: supported preset speed
    const vStr = params.get('v')
    if (vStr !== null && vStr !== '') {
      const v = Number(vStr)
      if (Number.isFinite(v) && (SPEEDS_H_PER_SEC as readonly number[]).includes(v)) {
        result.speedHPerSec = v
      }
    }

    // scenarios: s=<siteId>~<YYYY-MM-DD[THH:MM:SSZ]>~<durationH>~<slipDays>;...
    const sStr = params.get('s')
    if (sStr !== null && sStr !== '') {
      const scenarioTokens = sStr.split(';')
      const validScenarios: UrlState['scenarios'] = []

      for (const token of scenarioTokens) {
        if (!token) continue
        const fields = token.split('~')
        if (fields.length !== 4) continue

        const [siteId, dateStr, durStr, slipStr] = fields

        // siteId must match ^[a-z0-9_-]{1,64}$
        if (!/^[a-z0-9_-]{1,64}$/.test(siteId)) continue

        // start must be a real calendar date, optionally with a UTC time of day
        const startUtc = decodeStart(dateStr)
        if (startUtc === null) continue

        // durationH an integer 1 to 1440
        const dur = Number(durStr)
        if (!Number.isInteger(dur) || dur < 1 || dur > 1440) continue

        // slipDays an integer clamped to +-MAX_SLIP_DAYS
        const slip = Number(slipStr)
        if (!Number.isFinite(slip)) continue
        const slipInt = Math.round(slip)
        const clampedSlip = Math.max(
          -MAX_SLIP_DAYS,
          Math.min(MAX_SLIP_DAYS, slipInt),
        )

        validScenarios.push({
          siteId,
          startUtc,
          durationH: dur,
          slipDays: clampedSlip,
        })
      }

      if (validScenarios.length > 0) {
        result.scenarios = validScenarios.slice(0, MAX_SCENARIOS)
      }
    }
  } catch {
    // tolerant: never throws
  }

  return result
}
