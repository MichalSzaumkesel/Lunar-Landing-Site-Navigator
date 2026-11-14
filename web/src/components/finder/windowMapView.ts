import type { LandingWindow, MissionRules } from '../../lib/types'
import type { WindowMapRow } from '../../lib/windowMap'

export const UTC_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Returns cell fill colour based on validity and percentage of mission sunlit.
 * valid === 1: theme both green (#5ee6a8 / rgb(94, 230, 168)) with intensity by pctSunlit
 * valid === 0: dark neutral (rgb(22, 29, 46)) with faint tint by pctSunlit
 * valid === 255: hatch (interval outside data coverage)
 */
export function getCellColor(valid: number, pctSunlit: number): string {
  if (valid === 255) {
    return 'hatch'
  }

  const t = Math.max(0, Math.min(100, Number.isFinite(pctSunlit) ? pctSunlit : 0)) / 100

  if (valid === 1) {
    // Both-green #5ee6a8 is rgb(94, 230, 168). Scale from deep green (38, 92, 67) to vibrant (94, 230, 168).
    const r = Math.round(38 + (94 - 38) * t)
    const g = Math.round(92 + (230 - 92) * t)
    const b = Math.round(67 + (168 - 67) * t)
    return `rgb(${r}, ${g}, ${b})`
  }

  // Dark neutral base is rgb(22, 29, 46) (#161d2e), faint warm tint with sunlit percentage up to (45, 50, 55).
  const r = Math.round(22 + (45 - 22) * t)
  const g = Math.round(29 + (50 - 29) * t)
  const b = Math.round(46 + (55 - 46) * t)
  return `rgb(${r}, ${g}, ${b})`
}

/** Check if the cell indicates out-of-coverage data. */
export function isHatch(valid: number): boolean {
  return valid === 255
}

/**
 * Maps pointer coordinates (x, y) relative to the canvas into row and column indices.
 * Returns null if out of bounds or dimensions are non-positive.
 */
export function cellFromPointer(
  x: number,
  y: number,
  width: number,
  height: number,
  rowCount: number,
  colCount: number
): { rowIndex: number; colIndex: number } | null {
  if (rowCount <= 0 || colCount <= 0 || width <= 0 || height <= 0) {
    return null
  }
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return null
  }

  const colIndex = Math.min(colCount - 1, Math.max(0, Math.floor((x / width) * colCount)))
  const rowIndex = Math.min(rowCount - 1, Math.max(0, Math.floor((y / height) * rowCount)))
  return { rowIndex, colIndex }
}

/**
 * Handles keyboard navigation within the grid.
 * ArrowLeft / ArrowRight: 1 day (or 7 days if shiftKey)
 * ArrowUp / ArrowDown: 1 site
 */
export function moveHighlight(
  current: { rowIndex: number; colIndex: number },
  key: string,
  shiftKey: boolean,
  rowCount: number,
  colCount: number
): { rowIndex: number; colIndex: number } | null {
  if (rowCount <= 0 || colCount <= 0) {
    return null
  }

  const step = shiftKey ? 7 : 1

  switch (key) {
    case 'ArrowLeft':
      return {
        rowIndex: current.rowIndex,
        colIndex: Math.max(0, current.colIndex - step),
      }
    case 'ArrowRight':
      return {
        rowIndex: current.rowIndex,
        colIndex: Math.min(colCount - 1, current.colIndex + step),
      }
    case 'ArrowUp':
      return {
        rowIndex: Math.max(0, current.rowIndex - 1),
        colIndex: current.colIndex,
      }
    case 'ArrowDown':
      return {
        rowIndex: Math.min(rowCount - 1, current.rowIndex + 1),
        colIndex: current.colIndex,
      }
    default:
      return null
  }
}

/** Formats a date or timestamp to UTC "D MMM YYYY" (e.g. "12 Mar 2027"). */
export function formatDateUtc(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  const day = d.getUTCDate()
  const month = UTC_MONTHS[d.getUTCMonth()]
  const year = d.getUTCFullYear()
  return `${day} ${month} ${year}`
}

/** Formats a date or timestamp to UTC "YYYY-MM-DD" (e.g. "2027-03-12"). */
export function formatDateIso(date: Date | string | number): string {
  const d = typeof date === 'object' ? date : new Date(date)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  return d.toISOString().slice(0, 10)
}

/** Formats a landing window as "12 Mar 2027 to 19 Mar 2027 (landing times)". */
export function formatLandingWindow(window: LandingWindow): string {
  return `${formatDateUtc(window.start_utc)} to ${formatDateUtc(window.end_utc)} (landing times)`
}

/**
 * Computes the slip buffer in hours: half of the window length in hours, rounded to 0.5 h.
 */
export function slipBufferH(window: { start_utc: string; end_utc: string }): number {
  const start = Date.parse(window.start_utc)
  const end = Date.parse(window.end_utc)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0
  }
  const rawH = (end - start) / 2 / 3_600_000
  return Math.round(rawH * 2) / 2
}

/** Formats landing windows per site, capped at maxDisplay (default 5). */
export function formatSiteWindows(
  windows: LandingWindow[],
  maxDisplay = 5
): { displayed: string[]; remainingCount: number } {
  if (!windows || windows.length === 0) {
    return { displayed: [], remainingCount: 0 }
  }
  const displayed = windows.slice(0, maxDisplay).map(formatLandingWindow)
  const remainingCount = Math.max(0, windows.length - maxDisplay)
  return { displayed, remainingCount }
}

export interface SiteInfo {
  id: string
  name: string
}

/**
 * Finds the site with the highest number of valid landing days.
 * Returns null if all valid counts are zero or rows are empty.
 */
export function findBestSite(
  rows: Pick<WindowMapRow, 'siteId' | 'valid'>[],
  sites: SiteInfo[]
): { siteId: string; name: string; validDays: number } | null {
  if (rows.length === 0) {
    return null
  }

  let bestSiteId: string | null = null
  let maxValid = 0

  for (const row of rows) {
    let count = 0
    for (let i = 0; i < row.valid.length; i++) {
      if (row.valid[i] === 1) {
        count++
      }
    }
    if (count > maxValid) {
      maxValid = count
      bestSiteId = row.siteId
    }
  }

  if (bestSiteId === null || maxValid === 0) {
    return null
  }

  const site = sites.find((s) => s.id === bestSiteId)
  const name = site?.name ?? bestSiteId
  return { siteId: bestSiteId, name, validDays: maxValid }
}

/**
 * Generates the "Best site" summary sentence:
 * - "Best site: <Name> (N valid days)"
 * - or "No site fits these rules. Relax a rule below." when all are zero.
 */
export function getBestSiteSentence(
  rows: Pick<WindowMapRow, 'siteId' | 'valid'>[],
  sites: SiteInfo[]
): string {
  const best = findBestSite(rows, sites)
  if (!best || best.validDays === 0) {
    return 'No site fits these rules. Relax a rule below.'
  }
  const dayWord = best.validDays === 1 ? 'day' : 'days'
  return `Best site: ${best.name} (${best.validDays} valid ${dayWord})`
}

/**
 * Formats the mission rules in one human-readable sentence.
 * e.g. "Mission 10 days, Sun visible at least 70%, dark stretch at most 48 h, Earth in view at landing and at least 50% of the time"
 */
export function formatRuleSummary(rules: MissionRules): string {
  const parts: string[] = []

  const days = rules.missionDurationH / 24
  const durStr = days % 1 === 0 ? `${days} ${days === 1 ? 'day' : 'days'}` : `${rules.missionDurationH} h`
  parts.push(`Mission ${durStr}`)

  parts.push(`Sun visible at least ${rules.minPctSunlit}%`)
  parts.push(`dark stretch at most ${rules.maxLongestDarkH} h`)

  if (rules.earthAtLandingRequired && rules.minPctEarth > 0) {
    parts.push(`Earth in view at landing and at least ${rules.minPctEarth}% of the time`)
  } else if (rules.earthAtLandingRequired) {
    parts.push('Earth in view at landing')
  } else if (rules.minPctEarth > 0) {
    parts.push(`Earth in view at least ${rules.minPctEarth}% of the time`)
  }

  if (rules.minSunElAtLandingDeg !== undefined && Number.isFinite(rules.minSunElAtLandingDeg)) {
    parts.push(`Sun elevation at landing at least ${rules.minSunElAtLandingDeg}°`)
  }

  return parts.join(', ')
}

export interface MonthTick {
  colIndex: number
  label: string
  pctX: number
}

/**
 * Computes month tick positions for the top axis header.
 */
export function getMonthTicks(startMs: number, stepMs: number, count: number): MonthTick[] {
  if (count <= 0 || stepMs <= 0) {
    return []
  }

  const ticks: MonthTick[] = []
  let lastMonth = -1

  for (let i = 0; i < count; i++) {
    const d = new Date(startMs + i * stepMs)
    const m = d.getUTCMonth()
    if (m !== lastMonth) {
      lastMonth = m
      ticks.push({
        colIndex: i,
        label: `${UTC_MONTHS[m]} ${d.getUTCFullYear()}`,
        pctX: (i / count) * 100,
      })
    }
  }

  return ticks
}

/**
 * Generates an announcement text for aria-live="polite".
 */
export function formatCellAnnouncement(
  siteName: string,
  dateStr: string,
  valid: number,
  pctSunlit: number,
  pctEarth: number,
  longestDarkH: number
): string {
  if (valid === 255) {
    return `${siteName}, ${dateStr}: Outside data coverage.`
  }

  const validText = valid === 1 ? 'Valid landing window' : 'Not valid'
  const sunText = Math.round(pctSunlit)
  const earthText = Math.round(pctEarth)
  const darkText = Math.round(longestDarkH)

  return `${siteName}, ${dateStr}: ${validText}. Sun visible ${sunText}%, Earth in view ${earthText}%, longest dark ${darkText} hours.`
}
