// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EXPORT_PNG_FOOTER,
  buildPngFilename,
  extractKeyMetricRows,
  getFooterText,
  inlineSvgStyles,
  renderCardToCanvas,
  type CardExportData,
} from './exportPng'
import type { ScenarioMetrics } from './types'

describe('buildPngFilename', () => {
  it('formats <siteId>_<startDate>.png from ISO UTC string', () => {
    expect(buildPngFilename('apollo_11', '2026-12-01T00:00:00Z')).toBe('apollo_11_2026-12-01.png')
    expect(buildPngFilename('shackleton_ridge', '2027-05-18T12:00:00Z')).toBe(
      'shackleton_ridge_2027-05-18.png',
    )
  })

  it('formats <siteId>_<startDate>.png from YYYY-MM-DD string', () => {
    expect(buildPngFilename('site_1', '2027-01-15')).toBe('site_1_2027-01-15.png')
  })

  it('formats <siteId>_<startDate>.png from epoch milliseconds', () => {
    const ms = Date.parse('2027-08-30T00:00:00Z')
    expect(buildPngFilename('apollo_11', ms)).toBe('apollo_11_2027-08-30.png')
  })

  it('sanitizes siteId with unusual characters', () => {
    expect(buildPngFilename('site with spaces!', '2027-03-01')).toBe(
      'site_with_spaces__2027-03-01.png',
    )
  })

  it('sanitizes date string containing non-ISO characters', () => {
    expect(buildPngFilename('site', '2027/03/01')).toBe('site_2027_03_01.png')
  })
})

describe('inlineSvgStyles', () => {
  it('adds explicit width and height attributes to SVG root if missing', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 400 400')
    const serialized = inlineSvgStyles(svg)
    expect(serialized).toContain('width="400"')
    expect(serialized).toContain('height="400"')
  })
})

describe('exportPng footer text and honest wording', () => {
  it('matches the required footer text exactly', () => {
    const expected =
      'Lunar Landing Site Navigator, Sun visible and Earth in view only, not a power or link guarantee'
    expect(EXPORT_PNG_FOOTER).toBe(expected)
    expect(getFooterText()).toBe(expected)
  })

  it('contains honest wording disclaiming power and link guarantees', () => {
    expect(EXPORT_PNG_FOOTER).toContain('Sun visible')
    expect(EXPORT_PNG_FOOTER).toContain('Earth in view')
    expect(EXPORT_PNG_FOOTER).toContain('not a power or link guarantee')
  })

  it('key metrics table contains no forbidden claim words (power, energy, signal, link availability)', () => {
    const mockMetrics: ScenarioMetrics = {
      sun_el_deg: 5.2,
      sun_clearance_deg: 3.1,
      pct_sunlit: 85.5,
      mean_sun_frac: 82.0,
      longest_dark_h: 12,
      pct_earth: 90.0,
      longest_no_earth_h: 0,
      pct_both: 80.0,
      next_sunset_utc: null,
      next_sunrise_utc: null,
      next_earthset_utc: null,
      next_earthrise_utc: null,
      time_to_sunset_h: null,
      time_to_earthset_h: null,
      gaps: {},
    }

    const rows = extractKeyMetricRows(mockMetrics)
    expect(rows.length).toBe(6)

    // Forbidden phrases/words to never claim in data metrics
    const forbiddenClaims = [
      /\bpower\b/i,
      /\benergy\b/i,
      /\bsignal\b/i,
      /\blink availability\b/i,
    ]

    for (const row of rows) {
      for (const forbidden of forbiddenClaims) {
        expect(row.label).not.toMatch(forbidden)
        expect(row.value).not.toMatch(forbidden)
      }
    }
  })
})

describe('renderCardToCanvas', () => {
  beforeEach(() => {
    const mockCtx = {
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 150 }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'start',
      textBaseline: 'alphabetic',
    }

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCtx as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a 1600x900 canvas and draws header, sky plot box, metrics, and footer', async () => {
    const mockMetrics: ScenarioMetrics = {
      sun_el_deg: 4.5,
      sun_clearance_deg: 2.1,
      pct_sunlit: 75.0,
      mean_sun_frac: 72.3,
      longest_dark_h: 24,
      pct_earth: 65.0,
      longest_no_earth_h: 18,
      pct_both: 55.0,
      next_sunset_utc: null,
      next_sunrise_utc: null,
      next_earthset_utc: null,
      next_earthrise_utc: null,
      time_to_sunset_h: null,
      time_to_earthset_h: null,
      gaps: {},
    }

    const data: CardExportData = {
      siteName: 'Apollo 11',
      siteId: 'apollo_11',
      startUtc: '2026-12-01T00:00:00Z',
      endUtc: '2026-12-15T00:00:00Z',
      synthetic: true,
      approximate: false,
      metrics: mockMetrics,
      svgElement: null,
    }

    const canvas = await renderCardToCanvas(data)
    expect(canvas).toBeDefined()
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(900)
  })

  it('renders gracefully when metrics are null', async () => {
    const data: CardExportData = {
      siteName: 'Unknown Site',
      siteId: 'unknown',
      startUtc: '2026-12-01T00:00:00Z',
      endUtc: '2026-12-15T00:00:00Z',
      metrics: null,
      svgElement: null,
    }

    const canvas = await renderCardToCanvas(data)
    expect(canvas.width).toBe(1600)
    expect(canvas.height).toBe(900)
  })
})
