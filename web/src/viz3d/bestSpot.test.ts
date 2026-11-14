import { describe, expect, it } from 'vitest'
import {
  argmaxBestSpot,
  buildCellHeightGrid,
  clampSearchRadius,
  compassDirection8,
  formatResultSentence,
  slopeDeg,
} from './bestSpot'
import { findBestSpotAsync, cancelBestSpotSearch } from './bestSpotClient'

describe('slopeDeg', () => {
  it('returns 0 for a flat plane (all zero heights)', () => {
    const grid = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    expect(slopeDeg(grid, 1, 1, 10)).toBe(0)
    expect(slopeDeg(grid, 0, 0, 10)).toBe(0)
    expect(slopeDeg(grid, 2, 2, 10)).toBe(0)
  })

  it('calculates 45 degrees for a plane tilted eastwards with slope 1.0', () => {
    const spacingM = 10
    // z increases eastwards by 10 m per 10 m: dz/dx = 1.0, atan(1) = 45 deg
    const grid = [
      [0, 10, 20],
      [0, 10, 20],
      [0, 10, 20],
    ]
    // Interior cell
    expect(slopeDeg(grid, 1, 1, spacingM)).toBeCloseTo(45, 4)
    // Left edge (forward difference)
    expect(slopeDeg(grid, 1, 0, spacingM)).toBeCloseTo(45, 4)
    // Right edge (backward difference)
    expect(slopeDeg(grid, 1, 2, spacingM)).toBeCloseTo(45, 4)
  })

  it('calculates 45 degrees for a plane tilted northwards with slope 1.0', () => {
    const spacingM = 10
    // row 0 is north, row 2 is south.
    // North is 20m, South is 0m: dz/dy = 1.0
    const grid = [
      [20, 20, 20],
      [10, 10, 10],
      [0, 0, 0],
    ]
    expect(slopeDeg(grid, 1, 1, spacingM)).toBeCloseTo(45, 4)
    expect(slopeDeg(grid, 0, 1, spacingM)).toBeCloseTo(45, 4)
    expect(slopeDeg(grid, 2, 1, spacingM)).toBeCloseTo(45, 4)
  })

  it('calculates diagonal slope when tilted in both x and y', () => {
    const spacingM = 10
    // dz/dx = 1, dz/dy = 1 -> grad = sqrt(2) -> atan(sqrt(2)) = 54.7356 deg
    const grid = [
      [10, 20, 30],
      [0, 10, 20],
      [-10, 0, 10],
    ]
    const expected = (Math.atan(Math.SQRT2) * 180) / Math.PI
    expect(slopeDeg(grid, 1, 1, spacingM)).toBeCloseTo(expected, 4)
  })

  it('supports 1D flat Float32Array grids', () => {
    const spacingM = 5
    const flat = new Float32Array([
      0, 5, 10,
      0, 5, 10,
      0, 5, 10,
    ])
    expect(slopeDeg(flat, 1, 1, spacingM)).toBeCloseTo(45, 4)
    expect(slopeDeg(flat, 0, 0, spacingM)).toBeCloseTo(45, 4)
  })

  it('correctly discriminates slope under 10 degrees vs over 10 degrees', () => {
    const spacingM = 100
    // tan(9 deg) = ~0.15838 -> dz = 15.838 m
    const flatGrid = [
      [0, 15.838, 31.676],
      [0, 15.838, 31.676],
      [0, 15.838, 31.676],
    ]
    expect(slopeDeg(flatGrid, 1, 1, spacingM)).toBeLessThan(10)

    // tan(11 deg) = ~0.19438 -> dz = 19.438 m
    const steepGrid = [
      [0, 19.438, 38.876],
      [0, 19.438, 38.876],
      [0, 19.438, 38.876],
    ]
    expect(slopeDeg(steepGrid, 1, 1, spacingM)).toBeGreaterThan(10)
  })

  it('returns 0 for degenerate or out of bounds inputs', () => {
    expect(slopeDeg([], 0, 0, 10)).toBe(0)
    expect(slopeDeg([[1]], 0, 0, 0)).toBe(0)
    expect(slopeDeg([[1, 2], [3, 4]], -1, 0, 10)).toBe(0)
    expect(slopeDeg([[1, 2], [3, 4]], 5, 0, 10)).toBe(0)
  })
})

describe('compassDirection8', () => {
  it('maps standard compass angles to 8-point compass words', () => {
    expect(compassDirection8(0)).toBe('north')
    expect(compassDirection8(45)).toBe('north-east')
    expect(compassDirection8(90)).toBe('east')
    expect(compassDirection8(135)).toBe('south-east')
    expect(compassDirection8(180)).toBe('south')
    expect(compassDirection8(225)).toBe('south-west')
    expect(compassDirection8(270)).toBe('west')
    expect(compassDirection8(315)).toBe('north-west')
    expect(compassDirection8(360)).toBe('north')
  })

  it('handles boundary angles around sector thresholds', () => {
    // 22.5 deg threshold between north and north-east
    expect(compassDirection8(22)).toBe('north')
    expect(compassDirection8(23)).toBe('north-east')
    // 67.5 deg threshold between north-east and east
    expect(compassDirection8(67)).toBe('north-east')
    expect(compassDirection8(68)).toBe('east')
    // 337.5 deg threshold between north-west and north
    expect(compassDirection8(337)).toBe('north-west')
    expect(compassDirection8(338)).toBe('north')
  })

  it('handles negative angles with wrap-around', () => {
    expect(compassDirection8(-90)).toBe('west')
    expect(compassDirection8(-45)).toBe('north-west')
    expect(compassDirection8(-180)).toBe('south')
  })
})

describe('clampSearchRadius', () => {
  it('preserves radius when well within patch interior', () => {
    // 100 px at 50 m = 5000 m span. Half-span = 2500 m. Margin = 100 m. Max = 2400 m.
    expect(clampSearchRadius(500, 100, 50)).toBe(500)
    expect(clampSearchRadius(1000, 100, 50)).toBe(1000)
    expect(clampSearchRadius(2000, 100, 50)).toBe(2000)
  })

  it('clamps radius when it exceeds the patch interior margin', () => {
    // 40 px at 50 m = 2000 m span. Half-span = 1000 m. Margin = 100 m. Max = 900 m.
    expect(clampSearchRadius(1000, 40, 50)).toBe(900)
    expect(clampSearchRadius(2000, 40, 50)).toBe(900)
  })

  it('returns 0 when patch is smaller than margin', () => {
    expect(clampSearchRadius(500, 2, 50)).toBe(0)
  })
})

describe('formatResultSentence', () => {
  it('formats exact result sentence with 8-point compass word, rounded distance, and signed delta', () => {
    // 340 m north-east (offset ~ 240.4 m East, 240.4 m North)
    const offset = { eastM: 240.4, northM: 240.4 }
    const sentence = formatResultSentence(offset, 412, 351)
    expect(sentence).toBe(
      'Moved 340 m to the north-east. Sun visible: 412 h here vs 351 h at the original point (+61 h).',
    )
  })

  it('rounds distance to nearest 10 m', () => {
    // Math.hypot(344, 0) = 344 -> 340 m
    expect(formatResultSentence({ eastM: 344, northM: 0 }, 100, 90)).toContain('Moved 340 m to the east.')
    // Math.hypot(346, 0) = 346 -> 350 m
    expect(formatResultSentence({ eastM: 346, northM: 0 }, 100, 90)).toContain('Moved 350 m to the east.')
  })

  it('formats negative delta hours', () => {
    const offset = { eastM: 0, northM: -500 }
    const sentence = formatResultSentence(offset, 300, 315)
    expect(sentence).toBe(
      'Moved 500 m to the south. Sun visible: 300 h here vs 315 h at the original point (-15 h).',
    )
  })

  it('formats zero distance when already at origin', () => {
    const offset = { eastM: 0, northM: 0 }
    const sentence = formatResultSentence(offset, 350, 350)
    expect(sentence).toBe(
      'Moved 0 m. Sun visible: 350 h here vs 350 h at the original point (+0 h).',
    )
  })
})

describe('argmaxBestSpot', () => {
  it('finds known best cell in a synthetic grid', () => {
    const gridN = 5
    const extentM = 1000
    const sunlitGrid = new Float32Array(gridN * gridN).fill(20)
    const heightGrid = new Float32Array(gridN * gridN).fill(0) // completely flat

    // Place highest sunlit value at row 1, col 3:
    // row 1: y = 500 - (1 + 0.5) * 200 = 200 m North
    // col 3: x = -500 + (3 + 0.5) * 200 = 200 m East
    const bestIdx = 1 * gridN + 3
    sunlitGrid[bestIdx] = 85

    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid,
      gridN,
      extentM,
      radiusM: 500,
    })

    expect(result).not.toBeNull()
    expect(result?.row).toBe(1)
    expect(result?.col).toBe(3)
    expect(result?.index).toBe(bestIdx)
    expect(result?.offset.eastM).toBe(200)
    expect(result?.offset.northM).toBe(200)
    expect(result?.sunlitVal).toBe(85)
    expect(result?.slopeDeg).toBe(0)
  })

  it('breaks ties by choosing the cell closest to the original site (0, 0)', () => {
    const gridN = 5
    const extentM = 1000 // cellSize = 200 m, halfExtent = 500 m
    const sunlitGrid = new Float32Array(gridN * gridN).fill(10)
    const heightGrid = new Float32Array(gridN * gridN).fill(0)

    // Cell A at row 2, col 3: r=2, c=3 -> x = -500 + 2.5*200 = 0, y = 500 - 1.5*200 = 200 -> dist = 200 m
    // Cell B at row 0, col 2: r=0, c=2 -> x = 0, y = 400 m -> dist = 400 m
    const idxA = 2 * gridN + 3 // x = +200, y = 0 -> dist = 200 m
    const idxB = 2 // r=0, c=2 -> x = 0, y = +400 -> dist = 400 m

    sunlitGrid[idxA] = 90
    sunlitGrid[idxB] = 90 // equal value (tie)

    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid,
      gridN,
      extentM,
      radiusM: 500,
    })

    expect(result).not.toBeNull()
    expect(result?.index).toBe(idxA)
    expect(result?.distanceM).toBeCloseTo(200, 1)
  })

  it('returns null when all cells are too steep (slope >= 10 deg)', () => {
    const gridN = 5
    const extentM = 500
    const cellSize = extentM / gridN // 100 m
    const sunlitGrid = new Float32Array(gridN * gridN).fill(50)
    sunlitGrid[12] = 95 // centre cell has 95% sunlit

    // Height grid tilted at 45 degrees everywhere: slope = 45 deg >= 10 deg
    const heightGrid = new Float32Array(gridN * gridN)
    for (let r = 0; r < gridN; r++) {
      for (let c = 0; c < gridN; c++) {
        heightGrid[r * gridN + c] = c * cellSize
      }
    }

    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid,
      gridN,
      extentM,
      radiusM: 500,
      maxSlopeDeg: 10,
    })

    expect(result).toBeNull()
  })

  it('filters out cells outside the search radius selector', () => {
    const gridN = 5
    const extentM = 1000 // cellSize = 200m
    const sunlitGrid = new Float32Array(gridN * gridN).fill(10)
    const heightGrid = new Float32Array(gridN * gridN).fill(0)

    // Cell at corner (r=0, c=0): dist = hypot(-400, 400) ~ 565.7 m
    // Cell at near-centre (r=2, c=3): dist = 200 m
    sunlitGrid[0] = 99 // high sunlit but dist = 566 m
    sunlitGrid[2 * gridN + 3] = 70 // lower sunlit but dist = 200 m

    // Search with radius = 300 m should exclude the corner cell and pick the near-centre cell
    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid,
      gridN,
      extentM,
      radiusM: 300,
    })

    expect(result).not.toBeNull()
    expect(result?.index).toBe(2 * gridN + 3)
    expect(result?.sunlitVal).toBe(70)
  })

  it('excludes cells in the patch margin (beyond clamped patch interior)', () => {
    const gridN = 5
    const extentM = 1000
    // patch span = 800m, halfSpan = 400m, margin = 2 * 50 = 100m -> maxPatchM = 300m
    const sunlitGrid = new Float32Array(gridN * gridN).fill(10)
    const heightGrid = new Float32Array(gridN * gridN).fill(0)

    // Corner (r=0, c=0) has x = -400, y = +400 (on margin boundary)
    // If margin is larger (e.g. marginM = 150m -> maxPatchM = 350m):
    sunlitGrid[0] = 100 // corner (x=-400, y=400)
    sunlitGrid[2 * gridN + 3] = 50 // inside (x=200, y=0)

    const result = argmaxBestSpot({
      sunlitGrid,
      heightGrid,
      gridN,
      extentM,
      radiusM: 1000,
      sizePx: 16, // span 800m, halfSpan 400m, margin 100m -> maxPatchM = 300m
      spacingM: 50,
    })

    expect(result).not.toBeNull()
    // Corner with x=400 > 300 is rejected, inside cell with x=200 is accepted
    expect(result?.index).toBe(2 * gridN + 3)
  })
})

describe('buildCellHeightGrid', () => {
  it('correctly samples heights for gridN x gridN centres', () => {
    const sizePx = 4
    const spacingM = 10
    // Flat heights with value 42
    const heights = new Float32Array(sizePx * sizePx).fill(42)
    const grid = buildCellHeightGrid(heights, sizePx, spacingM, 2, 40)
    expect(grid.length).toBe(4)
    for (let i = 0; i < grid.length; i++) {
      expect(grid[i]).toBe(42)
    }
  })
})

describe('findBestSpotAsync worker client', () => {
  it('resolves best spot using cached sunlight grid and reports progress', async () => {
    const gridN = 5
    const extentM = 500
    const cachedSunlitGrid = new Float32Array(gridN * gridN).fill(10)
    cachedSunlitGrid[12] = 80 // centre cell

    const heights = new Float32Array(16 * 16).fill(0)

    const dummyEphem = {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-01-01T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'test',
      start_utc: '2026-01-01T00:00:00Z',
      step_minutes: 60,
      count: 1,
      sun: { az: [0], el: [10] },
      earth: { az: [0], el: [0] },
      sun_ang_radius_deg: 0.26,
      earth_ang_radius_deg: 0.95,
    }

    const progressValues: number[] = []
    const res = await findBestSpotAsync(
      {
        heights,
        sizePx: 16,
        spacingM: 50,
        ephem: dummyEphem,
        observerHeightM: 2,
        startMs: 0,
        endMs: 3600000,
        gridN,
        extentM,
        radiusM: 500,
        cachedSunlitGrid,
      },
      (p) => progressValues.push(p),
    )

    expect(res.result).not.toBeNull()
    expect(res.result?.index).toBe(12)
    expect(progressValues.length).toBeGreaterThan(0)
  })

  it('can be cancelled without unhandled rejection', () => {
    cancelBestSpotSearch()
    // Calling cancel repeatedly is safe
    expect(() => cancelBestSpotSearch()).not.toThrow()
  })
})
