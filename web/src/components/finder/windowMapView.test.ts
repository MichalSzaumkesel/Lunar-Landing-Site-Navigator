import { describe, expect, it } from 'vitest'
import type { LandingWindow, MissionRules } from '../../lib/types'
import {
  cellFromPointer,
  customSiteIdsFromScenarios,
  siteRowLabel,
  findBestSite,
  formatCellAnnouncement,
  formatDateIso,
  formatDateUtc,
  formatLandingWindow,
  formatRuleSummary,
  formatSiteWindows,
  getBestSiteSentence,
  getCellColor,
  getMonthTicks,
  gridGeometry,
  isHatch,
  moveHighlight,
  slipBufferH,
} from './windowMapView'

describe('windowMapView pure helpers', () => {
  describe('getCellColor & isHatch', () => {
    it('returns hatch indicator for valid === 255', () => {
      expect(getCellColor(255, 100)).toBe('hatch')
      expect(getCellColor(255, 0)).toBe('hatch')
      expect(isHatch(255)).toBe(true)
      expect(isHatch(1)).toBe(false)
      expect(isHatch(0)).toBe(false)
    })

    it('returns green both tint for valid === 1 scaled by pctSunlit', () => {
      const color100 = getCellColor(1, 100)
      const color0 = getCellColor(1, 0)
      const color50 = getCellColor(1, 50)

      expect(color100).toBe('rgb(94, 230, 168)')
      expect(color0).toBe('rgb(38, 92, 67)')
      expect(color50).toBe('rgb(66, 161, 118)')
    })

    it('returns dark neutral with faint tint for valid === 0', () => {
      const color0 = getCellColor(0, 0)
      const color100 = getCellColor(0, 100)

      expect(color0).toBe('rgb(22, 29, 46)')
      expect(color100).toBe('rgb(45, 50, 55)')
    })
  })

  describe('cellFromPointer', () => {
    const width = 800
    const height = 140
    const rowCount = 5
    const colCount = 100

    it('returns null for coordinates outside bounding box', () => {
      expect(cellFromPointer(-1, 50, width, height, rowCount, colCount)).toBeNull()
      expect(cellFromPointer(800, 50, width, height, rowCount, colCount)).toBeNull()
      expect(cellFromPointer(100, -5, width, height, rowCount, colCount)).toBeNull()
      expect(cellFromPointer(100, 140, width, height, rowCount, colCount)).toBeNull()
    })

    it('returns null for non-positive dimensions', () => {
      expect(cellFromPointer(10, 10, 0, height, rowCount, colCount)).toBeNull()
      expect(cellFromPointer(10, 10, width, 0, rowCount, colCount)).toBeNull()
      expect(cellFromPointer(10, 10, width, height, 0, colCount)).toBeNull()
      expect(cellFromPointer(10, 10, width, height, rowCount, 0)).toBeNull()
    })

    it('computes correct row and column indices', () => {
      // (0, 0) -> row 0, col 0
      expect(cellFromPointer(0, 0, width, height, rowCount, colCount)).toEqual({
        rowIndex: 0,
        colIndex: 0,
      })

      // x = 799, y = 139 -> row 4, col 99
      expect(cellFromPointer(799, 139, width, height, rowCount, colCount)).toEqual({
        rowIndex: 4,
        colIndex: 99,
      })

      // x = 400 (halfway), y = 70 (halfway) -> col 50, row 2
      expect(cellFromPointer(400, 70, width, height, rowCount, colCount)).toEqual({
        rowIndex: 2,
        colIndex: 50,
      })
    })
  })

  describe('moveHighlight', () => {
    const rowCount = 4
    const colCount = 30
    const current = { rowIndex: 1, colIndex: 10 }

    it('moves 1 cell on standard arrow keys', () => {
      expect(moveHighlight(current, 'ArrowLeft', false, rowCount, colCount)).toEqual({
        rowIndex: 1,
        colIndex: 9,
      })
      expect(moveHighlight(current, 'ArrowRight', false, rowCount, colCount)).toEqual({
        rowIndex: 1,
        colIndex: 11,
      })
      expect(moveHighlight(current, 'ArrowUp', false, rowCount, colCount)).toEqual({
        rowIndex: 0,
        colIndex: 10,
      })
      expect(moveHighlight(current, 'ArrowDown', false, rowCount, colCount)).toEqual({
        rowIndex: 2,
        colIndex: 10,
      })
    })

    it('moves 7 cells horizontally on Shift + arrow keys', () => {
      expect(moveHighlight(current, 'ArrowLeft', true, rowCount, colCount)).toEqual({
        rowIndex: 1,
        colIndex: 3,
      })
      expect(moveHighlight(current, 'ArrowRight', true, rowCount, colCount)).toEqual({
        rowIndex: 1,
        colIndex: 17,
      })
    })

    it('clamps to bounds', () => {
      const edge = { rowIndex: 0, colIndex: 2 }
      expect(moveHighlight(edge, 'ArrowLeft', true, rowCount, colCount)).toEqual({
        rowIndex: 0,
        colIndex: 0,
      })
      expect(moveHighlight(edge, 'ArrowUp', false, rowCount, colCount)).toEqual({
        rowIndex: 0,
        colIndex: 2,
      })

      const farEdge = { rowIndex: 3, colIndex: 28 }
      expect(moveHighlight(farEdge, 'ArrowRight', true, rowCount, colCount)).toEqual({
        rowIndex: 3,
        colIndex: 29,
      })
      expect(moveHighlight(farEdge, 'ArrowDown', false, rowCount, colCount)).toEqual({
        rowIndex: 3,
        colIndex: 28,
      })
    })

    it('returns null on unhandled key or empty grid', () => {
      expect(moveHighlight(current, 'Enter', false, rowCount, colCount)).toBeNull()
      expect(moveHighlight(current, 'ArrowLeft', false, 0, 10)).toBeNull()
    })
  })

  describe('formatDateUtc and formatDateIso', () => {
    it('formats UTC dates correctly', () => {
      const utcMs = Date.parse('2027-03-12T00:00:00Z')
      expect(formatDateUtc(utcMs)).toBe('12 Mar 2027')
      expect(formatDateIso(utcMs)).toBe('2027-03-12')
    })

    it('handles invalid dates gracefully', () => {
      expect(formatDateUtc('invalid-date')).toBe('')
      expect(formatDateIso('invalid-date')).toBe('')
    })
  })

  describe('formatLandingWindow and formatSiteWindows', () => {
    it('formats a single landing window', () => {
      const window: LandingWindow = {
        start_utc: '2027-03-12T00:00:00Z',
        end_utc: '2027-03-19T00:00:00Z',
      }
      expect(formatLandingWindow(window)).toBe('12 Mar 2027 to 19 Mar 2027 (landing times)')
    })

    it('formats site windows capped at 5 with remaining count', () => {
      const windows: LandingWindow[] = [
        { start_utc: '2027-01-01T00:00:00Z', end_utc: '2027-01-05T00:00:00Z' },
        { start_utc: '2027-02-01T00:00:00Z', end_utc: '2027-02-05T00:00:00Z' },
        { start_utc: '2027-03-01T00:00:00Z', end_utc: '2027-03-05T00:00:00Z' },
        { start_utc: '2027-04-01T00:00:00Z', end_utc: '2027-04-05T00:00:00Z' },
        { start_utc: '2027-05-01T00:00:00Z', end_utc: '2027-05-05T00:00:00Z' },
        { start_utc: '2027-06-01T00:00:00Z', end_utc: '2027-06-05T00:00:00Z' },
        { start_utc: '2027-07-01T00:00:00Z', end_utc: '2027-07-05T00:00:00Z' },
      ]
      const res = formatSiteWindows(windows, 5)
      expect(res.displayed).toHaveLength(5)
      expect(res.remainingCount).toBe(2)
      expect(res.displayed[0]).toBe('1 Jan 2027 to 5 Jan 2027 (landing times)')
    })

    it('returns empty displayed and 0 remaining when empty', () => {
      expect(formatSiteWindows([])).toEqual({ displayed: [], remainingCount: 0 })
    })
  })

  describe('findBestSite & getBestSiteSentence', () => {
    const sites = [
      { id: 'site_a', name: 'Site Alpha' },
      { id: 'site_b', name: 'Site Beta' },
    ]

    it('identifies the site with highest valid day count', () => {
      const rows = [
        { siteId: 'site_a', valid: new Uint8Array([0, 1, 1, 0]) },
        { siteId: 'site_b', valid: new Uint8Array([1, 1, 1, 1]) },
      ]
      const best = findBestSite(rows, sites)
      expect(best).toEqual({
        siteId: 'site_b',
        name: 'Site Beta',
        validDays: 4,
      })
      expect(getBestSiteSentence(rows, sites)).toBe('Most valid days: Site Beta (4 days)')
    })

    it('returns relaxation prompt when all counts are 0', () => {
      const rows = [
        { siteId: 'site_a', valid: new Uint8Array([0, 0, 0, 0]) },
        { siteId: 'site_b', valid: new Uint8Array([0, 0, 0, 0]) },
      ]
      expect(findBestSite(rows, sites)).toBeNull()
      expect(getBestSiteSentence(rows, sites)).toBe('No site fits these rules. Relax a rule below.')
    })

    it('handles empty rows', () => {
      expect(findBestSite([], sites)).toBeNull()
      expect(getBestSiteSentence([], sites)).toBe('No site fits these rules. Relax a rule below.')
    })
  })

  describe('formatRuleSummary', () => {
    it('formats default example rules matching spec example sentence', () => {
      const rules: MissionRules = {
        observerHeightM: 2,
        missionDurationH: 240,
        minPctSunlit: 70,
        maxLongestDarkH: 48,
        earthAtLandingRequired: true,
        minPctEarth: 50,
      }
      expect(formatRuleSummary(rules)).toBe(
        'Mission 10 days, Sun visible at least 70%, dark stretch at most 48 h, Earth in view at landing and at least 50% of the time'
      )
    })

    it('formats custom rules with elevation rule and non-integer days', () => {
      const rules: MissionRules = {
        observerHeightM: 10,
        missionDurationH: 36,
        minPctSunlit: 80,
        maxLongestDarkH: 12,
        earthAtLandingRequired: false,
        minPctEarth: 20,
        minSunElAtLandingDeg: 5,
      }
      expect(formatRuleSummary(rules)).toBe(
        'Mission 36 h, Sun visible at least 80%, dark stretch at most 12 h, Earth in view at least 20% of the time, Sun elevation at landing at least 5°'
      )
    })
  })

  describe('getMonthTicks', () => {
    // 760 daily columns from 2026-12-01 (about 25 months)
    const startMs = Date.parse('2026-12-01T00:00:00Z')
    const stepMs = 86_400_000
    const count = 760
    const charW = 7

    it('prints the year on the first label and on each January', () => {
      const ticks = getMonthTicks(startMs, stepMs, count, 1700)
      const labels = ticks.map((t) => t.label)
      expect(labels.slice(0, 4)).toEqual(['Dec 2026', 'Jan 2027', 'Feb', 'Mar'])
      expect(labels).toContain('Jan 2028')
    })

    it('uses monthly labels only when each has at least 56 px', () => {
      for (const width of [390, 768, 1366, 2000]) {
        const labelled = getMonthTicks(startMs, stepMs, count, width).filter((t) => t.label !== null)
        const monthly = labelled.length >= 24
        if (monthly) {
          for (let i = 1; i < labelled.length; i++) {
            expect(labelled[i].x - labelled[i - 1].x).toBeGreaterThanOrEqual(56)
          }
        }
      }
      expect(getMonthTicks(startMs, stepMs, count, 2000).filter((t) => t.label !== null)).toHaveLength(25)
      expect(getMonthTicks(startMs, stepMs, count, 768).filter((t) => t.label !== null).length).toBeLessThan(25)
    })

    it('never overlaps labels at any width and keeps minor ticks for every month', () => {
      for (const width of [150, 190, 390, 600, 768, 1100, 1366, 2000, 2560]) {
        const ticks = getMonthTicks(startMs, stepMs, count, width)
        expect(ticks).toHaveLength(25)
        let prevEnd = -Infinity
        for (const t of ticks) {
          if (t.label === null) continue
          expect(t.x).toBeGreaterThanOrEqual(prevEnd)
          const end = t.x + t.label.length * charW
          expect(end).toBeLessThanOrEqual(width)
          prevEnd = end
        }
      }
    })

    it('falls back to years on a very narrow axis and handles empty input', () => {
      const labels = getMonthTicks(startMs, stepMs, count, 190)
        .map((t) => t.label)
        .filter((l) => l !== null)
      expect(labels.every((l) => /^\d{4}$/.test(l as string))).toBe(true)
      expect(getMonthTicks(startMs, stepMs, 0, 800)).toEqual([])
      expect(getMonthTicks(startMs, stepMs, count, 0)).toEqual([])
    })
  })

  describe('gridGeometry', () => {
    it('clamps the label column to 160..280 px and fills the rest with the canvas', () => {
      expect(gridGeometry(353, 7, 760, 40).labelWidth).toBe(160)
      expect(gridGeometry(1000, 7, 760, 40).labelWidth).toBe(200)
      expect(gridGeometry(1900, 7, 760, 40).labelWidth).toBe(280)
      for (const w of [353, 731, 1329, 1963, 2523]) {
        const g = gridGeometry(w, 7, 760, 40)
        expect(g.labelWidth + g.canvasWidth).toBe(w)
        expect(g.canvasHeight).toBe(280)
        expect(g.colWidth).toBeCloseTo(g.canvasWidth / 760, 10)
      }
    })

    it('agrees with cellFromPointer at the canvas edges', () => {
      const g = gridGeometry(1963, 7, 760, 40)
      expect(cellFromPointer(0, 0, g.canvasWidth, g.canvasHeight, 7, 760)).toEqual({ rowIndex: 0, colIndex: 0 })
      expect(cellFromPointer(g.canvasWidth - 0.5, g.canvasHeight - 0.5, g.canvasWidth, g.canvasHeight, 7, 760)).toEqual({
        rowIndex: 6,
        colIndex: 759,
      })
      const mid = cellFromPointer(g.colWidth * 100.5, 60, g.canvasWidth, g.canvasHeight, 7, 760)
      expect(mid).toEqual({ rowIndex: 1, colIndex: 100 })
    })

    it('handles zero sizes', () => {
      expect(gridGeometry(0, 0, 0, 40)).toEqual({ labelWidth: 160, canvasWidth: 0, canvasHeight: 0, colWidth: 0 })
    })
  })

  describe('formatCellAnnouncement', () => {
    it('formats announcement for valid cell', () => {
      const text = formatCellAnnouncement('Shackleton', '2027-03-12', 1, 85.4, 90.2, 8.1)
      expect(text).toBe(
        'Shackleton, 2027-03-12: Valid landing window. Sun visible 85%, Earth in view 90%, longest dark 8 hours.'
      )
    })

    it('formats announcement for out-of-coverage cell', () => {
      const text = formatCellAnnouncement('Shackleton', '2028-12-30', 255, 0, 0, 0)
      expect(text).toBe('Shackleton, 2028-12-30: Outside data coverage.')
    })
  })

  describe('slipBufferH', () => {
    it('calculates half window duration rounded to 0.5 hours', () => {
      // 10 hour window: half is 5.0
      expect(
        slipBufferH({
          start_utc: '2027-01-01T00:00:00Z',
          end_utc: '2027-01-01T10:00:00Z',
        })
      ).toBe(5)

      // 7 hour window: half is 3.5
      expect(
        slipBufferH({
          start_utc: '2027-01-01T00:00:00Z',
          end_utc: '2027-01-01T07:00:00Z',
        })
      ).toBe(3.5)

      // 7.4 hour window: half is 3.7 -> rounds to 3.5
      expect(
        slipBufferH({
          start_utc: '2027-01-01T00:00:00Z',
          end_utc: '2027-01-01T07:24:00Z',
        })
      ).toBe(3.5)

      // 7.6 hour window: half is 3.8 -> rounds to 4.0
      expect(
        slipBufferH({
          start_utc: '2027-01-01T00:00:00Z',
          end_utc: '2027-01-01T07:36:00Z',
        })
      ).toBe(4)

      // 24 hour window: half is 12
      expect(
        slipBufferH({
          start_utc: '2027-01-01T00:00:00Z',
          end_utc: '2027-01-02T00:00:00Z',
        })
      ).toBe(12)
    })

    it('returns 0 for inverted or invalid window', () => {
      expect(
        slipBufferH({
          start_utc: '2027-01-02T00:00:00Z',
          end_utc: '2027-01-01T00:00:00Z',
        })
      ).toBe(0)
      expect(
        slipBufferH({
          start_utc: 'invalid',
          end_utc: '2027-01-01T00:00:00Z',
        })
      ).toBe(0)
    })
  })
})

describe('custom site rows', () => {
  it('lists unique custom ids in order and ignores curated ids', () => {
    expect(
      customSiteIdsFromScenarios([
        { siteId: 'shackleton' },
        { siteId: 'custom_-89p500_12p000' },
        { siteId: 'custom_-89p500_12p000' },
        { siteId: 'custom_1p000_2p000' },
      ]),
    ).toEqual(['custom_-89p500_12p000', 'custom_1p000_2p000'])
  })

  it('labels approximate bundles', () => {
    expect(siteRowLabel({ site: { name: 'Custom site' }, approximate: true })).toBe('Custom site, approximate')
    expect(siteRowLabel({ site: { name: 'Site A' }, approximate: false })).toBe('Site A')
  })
})
