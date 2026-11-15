import type { BothVisible } from './bothVisible'
import type { ScenarioMetrics } from './types'

export interface ScenarioCsvRow {
  siteName: string
  siteId: string
  lat: number
  lon: number
  startUtc: string
  endUtc: string
  slipDays: number
  observerHeightM: number
  synthetic: boolean
  approximate: boolean
  metrics: ScenarioMetrics | null
  /** Derived Sun and Earth together values; the CSV column carries a _derived suffix. */
  bothVisible?: BothVisible | null
}

export const CSV_HEADERS = [
  'site_name',
  'site_id',
  'lat',
  'lon',
  'start_utc',
  'end_utc',
  'slip_days',
  'observer_height_m',
  'synthetic',
  'approximate',
  'pct_sunlit',
  'mean_sun_frac',
  'longest_dark_h',
  'pct_earth',
  'longest_no_earth_h',
  'pct_both',
  'next_sunset_utc',
  'next_sunrise_utc',
  'next_earthset_utc',
  'next_earthrise_utc',
  'time_to_sunset_h',
  'time_to_earthset_h',
  'sun_el_deg',
  'sun_clearance_deg',
  'longest_both_h_derived',
] as const

/** RFC 4180 field escaping with 3-decimal rounding for numbers. */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return ''
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return ''
    const rounded = Math.round(val * 1000) / 1000
    return Object.is(rounded, -0) ? '0' : String(rounded)
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false'
  }
  let str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replaceAll('"', '""')}"`
  }
  return str
}

/** Converts scenario metadata and metrics into an RFC 4180 CSV string with \r\n line endings. */
export function scenariosToCsv(rows: ScenarioCsvRow[]): string {
  const headerRow = CSV_HEADERS.join(',')
  const dataRows = rows.map((row) => {
    const m = row.metrics
    const cells = [
      escapeCsvField(row.siteName),
      escapeCsvField(row.siteId),
      escapeCsvField(row.lat),
      escapeCsvField(row.lon),
      escapeCsvField(row.startUtc),
      escapeCsvField(row.endUtc),
      escapeCsvField(row.slipDays),
      escapeCsvField(row.observerHeightM),
      escapeCsvField(row.synthetic),
      escapeCsvField(row.approximate),
      escapeCsvField(m?.pct_sunlit ?? null),
      escapeCsvField(m?.mean_sun_frac ?? null),
      escapeCsvField(m?.longest_dark_h ?? null),
      escapeCsvField(m?.pct_earth ?? null),
      escapeCsvField(m?.longest_no_earth_h ?? null),
      escapeCsvField(m?.pct_both ?? null),
      escapeCsvField(m?.next_sunset_utc ?? null),
      escapeCsvField(m?.next_sunrise_utc ?? null),
      escapeCsvField(m?.next_earthset_utc ?? null),
      escapeCsvField(m?.next_earthrise_utc ?? null),
      escapeCsvField(m?.time_to_sunset_h ?? null),
      escapeCsvField(m?.time_to_earthset_h ?? null),
      escapeCsvField(m?.sun_el_deg ?? null),
      escapeCsvField(m?.sun_clearance_deg ?? null),
      escapeCsvField(row.bothVisible?.longestH ?? null),
    ]
    return cells.join(',')
  })

  return [headerRow, ...dataRows].join('\r\n') + '\r\n'
}

/** Triggers a browser file download using a temporary anchor element and Blob URL. */
export function downloadText(
  filename: string,
  text: string,
  mime = 'text/csv;charset=utf-8;',
): void {
  if (
    typeof document === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return
  }

  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  if (typeof URL.revokeObjectURL === 'function') {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
