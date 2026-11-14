import { describe, expect, it, vi } from 'vitest'
import {
  CSV_HEADERS,
  downloadText,
  escapeCsvField,
  scenariosToCsv,
  type ScenarioCsvRow,
} from './exportCsv'
import type { ScenarioMetrics } from './types'

describe('escapeCsvField', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('rounds numbers to 3 decimals and normalizes -0', () => {
    expect(escapeCsvField(0)).toBe('0')
    expect(escapeCsvField(-0)).toBe('0')
    expect(escapeCsvField(12.3456)).toBe('12.346')
    expect(escapeCsvField(12.34)).toBe('12.34')
    expect(escapeCsvField(-89.9876)).toBe('-89.988')
    expect(escapeCsvField(NaN)).toBe('')
    expect(escapeCsvField(Infinity)).toBe('')
  })

  it('formats booleans', () => {
    expect(escapeCsvField(true)).toBe('true')
    expect(escapeCsvField(false)).toBe('false')
  })

  it('passes simple strings through unquoted', () => {
    expect(escapeCsvField('apollo_11')).toBe('apollo_11')
    expect(escapeCsvField('2026-11-14T00:00:00Z')).toBe('2026-11-14T00:00:00Z')
  })

  it('quotes fields with commas, quotes, or newlines and doubles internal quotes', () => {
    expect(escapeCsvField('Site, with comma')).toBe('"Site, with comma"')
    expect(escapeCsvField('Site "Quotes"')).toBe('"Site ""Quotes"""')
    expect(escapeCsvField('Site\nNewline')).toBe('"Site\nNewline"')
    expect(escapeCsvField('Site\rCarriage')).toBe('"Site\rCarriage"')
    expect(escapeCsvField('Site "Alpha", Shackleton')).toBe(
      '"Site ""Alpha"", Shackleton"',
    )
  })

  it('prefixes string cells starting with =, +, -, @, tab, or CR with an apostrophe (formula injection defense)', () => {
    expect(escapeCsvField('=SUM(A1)')).toBe('\'=SUM(A1)')
    expect(escapeCsvField('=SUM(1,2)')).toBe('"\'=SUM(1,2)"')
    expect(escapeCsvField('+cmd')).toBe('\'+cmd')
    expect(escapeCsvField('-formula')).toBe('\'-formula')
    expect(escapeCsvField('@calc')).toBe('\'@calc')
    expect(escapeCsvField('\ttabbed')).toBe('\'\ttabbed')
    expect(escapeCsvField('\rcarriage')).toBe('"\'\rcarriage"')
  })

  it('never prefixes numbers with an apostrophe even when negative', () => {
    expect(escapeCsvField(-1.5)).toBe('-1.5')
    expect(escapeCsvField(-12.345)).toBe('-12.345')
    expect(escapeCsvField(-89.9)).toBe('-89.9')
    expect(escapeCsvField(0)).toBe('0')
    expect(escapeCsvField(42)).toBe('42')
  })
})

describe('scenariosToCsv', () => {
  const sampleMetrics: ScenarioMetrics = {
    sun_el_deg: 1.2345,
    sun_clearance_deg: 0.5678,
    pct_sunlit: 75.1234,
    mean_sun_frac: 68.9999,
    longest_dark_h: 12.5,
    pct_earth: 90.0,
    longest_no_earth_h: 0.0,
    pct_both: 70.1234,
    next_sunset_utc: '2026-11-15T12:00:00Z',
    next_sunrise_utc: '2026-11-16T04:30:00Z',
    next_earthset_utc: null,
    next_earthrise_utc: null,
    time_to_sunset_h: 18.25,
    time_to_earthset_h: null,
    gaps: {
      earthset: 'beyond_data',
      earthrise: 'beyond_data',
    },
  }

  const sampleRow: ScenarioCsvRow = {
    siteName: 'Shackleton Rim',
    siteId: 'shackleton_rim',
    lat: -89.9,
    lon: 0.0,
    startUtc: '2026-11-14T00:00:00Z',
    endUtc: '2026-11-24T00:00:00Z',
    slipDays: 0,
    observerHeightM: 2,
    synthetic: false,
    approximate: false,
    metrics: sampleMetrics,
  }

  it('includes exact header names in order', () => {
    const csv = scenariosToCsv([])
    const firstLine = csv.split('\r\n')[0]
    expect(firstLine).toBe(CSV_HEADERS.join(','))
    expect(firstLine).toBe(
      'site_name,site_id,lat,lon,start_utc,end_utc,slip_days,observer_height_m,synthetic,approximate,pct_sunlit,mean_sun_frac,longest_dark_h,pct_earth,longest_no_earth_h,pct_both,next_sunset_utc,next_sunrise_utc,next_earthset_utc,next_earthrise_utc,time_to_sunset_h,time_to_earthset_h,sun_el_deg,sun_clearance_deg',
    )
  })

  it('uses \\r\\n line endings for all rows including the last', () => {
    const csv = scenariosToCsv([sampleRow])
    expect(csv.endsWith('\r\n')).toBe(true)
    const lines = csv.split('\r\n')
    // header + 1 row + empty trailing string after final \r\n
    expect(lines.length).toBe(3)
    expect(lines[2]).toBe('')
  })

  it('handles null metrics and null cells correctly', () => {
    const nullRow: ScenarioCsvRow = {
      ...sampleRow,
      metrics: null,
    }
    const csv = scenariosToCsv([nullRow])
    const dataLine = csv.split('\r\n')[1]
    const cells = dataLine.split(',')

    // First 10 scenario fields populated
    expect(cells[0]).toBe('Shackleton Rim')
    expect(cells[1]).toBe('shackleton_rim')
    expect(cells[2]).toBe('-89.9')
    expect(cells[3]).toBe('0')
    expect(cells[4]).toBe('2026-11-14T00:00:00Z')
    expect(cells[5]).toBe('2026-11-24T00:00:00Z')
    expect(cells[6]).toBe('0')
    expect(cells[7]).toBe('2')
    expect(cells[8]).toBe('false')
    expect(cells[9]).toBe('false')

    // Remaining 14 metric fields empty
    for (let i = 10; i < 24; i++) {
      expect(cells[i]).toBe('')
    }
  })

  it('rounds numeric values to 3 decimals in output', () => {
    const csv = scenariosToCsv([sampleRow])
    const dataLine = csv.split('\r\n')[1]
    const cells = dataLine.split(',')

    // sun_el_deg: 1.2345 -> 1.235
    expect(cells[22]).toBe('1.235')
    // sun_clearance_deg: 0.5678 -> 0.568
    expect(cells[23]).toBe('0.568')
    // pct_sunlit: 75.1234 -> 75.123
    expect(cells[10]).toBe('75.123')
    // mean_sun_frac: 68.9999 -> 69
    expect(cells[11]).toBe('69')
    // next_earthset_utc is null -> empty
    expect(cells[18]).toBe('')
    // time_to_earthset_h is null -> empty
    expect(cells[21]).toBe('')
  })

  it('correctly quotes rows with commas and quotes in site name', () => {
    const trickyRow: ScenarioCsvRow = {
      ...sampleRow,
      siteName: 'Site "Alpha", Shackleton Crater',
    }
    const csv = scenariosToCsv([trickyRow])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine.startsWith('"Site ""Alpha"", Shackleton Crater",')).toBe(true)
  })

  it('escapes formula injection characters in string fields while preserving negative numbers', () => {
    const formulaRow: ScenarioCsvRow = {
      ...sampleRow,
      siteName: '=SUM(A1)',
      lat: -1.5,
    }
    const csv = scenariosToCsv([formulaRow])
    const dataLine = csv.split('\r\n')[1]
    const cells = dataLine.split(',')
    expect(cells[0]).toBe('\'=SUM(A1)')
    expect(cells[2]).toBe('-1.5')
  })

  it('includes synthetic and approximate flags', () => {
    const fakeRow: ScenarioCsvRow = {
      ...sampleRow,
      synthetic: true,
      approximate: true,
    }
    const csv = scenariosToCsv([fakeRow])
    const dataLine = csv.split('\r\n')[1]
    const cells = dataLine.split(',')
    expect(cells[8]).toBe('true')
    expect(cells[9]).toBe('true')
  })
})

describe('downloadText', () => {
  it('returns safely in non-browser environment without errors', () => {
    expect(() => downloadText('test.csv', 'data')).not.toThrow()
  })

  it('creates an anchor with blob URL, triggers click, and cleans up when DOM is available', () => {
    vi.useFakeTimers()
    const clickMock = vi.fn()
    const appendMock = vi.fn()
    const removeMock = vi.fn()
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()

    const mockAnchor = {
      href: '',
      download: '',
      style: { display: '' },
      click: clickMock,
    }

    const mockDocument = {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: appendMock,
        removeChild: removeMock,
      },
    }

    const mockUrl = {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    }

    vi.stubGlobal('document', mockDocument)
    vi.stubGlobal('URL', mockUrl)

    downloadText('test.csv', 'col1,col2\r\n1,2\r\n')

    expect(createObjectURLMock).toHaveBeenCalled()
    expect(appendMock).toHaveBeenCalledWith(mockAnchor)
    expect(clickMock).toHaveBeenCalled()
    expect(removeMock).toHaveBeenCalledWith(mockAnchor)
    expect(mockAnchor.download).toBe('test.csv')

    // revokeObjectURL is asynchronous via setTimeout(1000)
    expect(revokeObjectURLMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')

    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})
