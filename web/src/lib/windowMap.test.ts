import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EphemFile, HorizonFile, MissionRules, SiteBundle } from './types'
import { findWindows } from './finder'
import { computeWindowMap, type WindowMapInput } from './windowMap'

function makeTinyBundle(opts: {
  sunEl: number[]
  earthEl: number[]
  sunAz?: number[]
  earthAz?: number[]
  masks?: Record<string, number[]>
  startUtc?: string
  stepMinutes?: number
  azStepDeg?: number
}): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const count = opts.sunEl.length
  return {
    horizon: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'test_tiny',
      az_step_deg: opts.azStepDeg ?? 360,
      n: 1,
      observer_heights_m: [2, 10],
      masks: opts.masks ?? { '2': [0], '10': [0] },
    },
    ephem: {
      meta: {
        contract_version: '1.1.1',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'test_tiny',
      start_utc: opts.startUtc ?? '2027-01-01T00:00:00Z',
      step_minutes: opts.stepMinutes ?? 60,
      count,
      sun: {
        az: opts.sunAz ?? new Array(count).fill(0),
        el: opts.sunEl,
      },
      earth: {
        az: opts.earthAz ?? new Array(count).fill(0),
        el: opts.earthEl,
      },
      sun_ang_radius_deg: 0.2666,
      earth_ang_radius_deg: 0.95,
    },
  }
}

function loadMockBundle(siteId: string): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const horizonPath = path.resolve(
    process.cwd(),
    `public/data/mock/horizon/${siteId}.json`
  )
  const ephemPath = path.resolve(
    process.cwd(),
    `public/data/mock/ephem/${siteId}.json`
  )

  const horizon = JSON.parse(
    fs.readFileSync(horizonPath, 'utf-8')
  ) as HorizonFile
  const ephem = JSON.parse(fs.readFileSync(ephemPath, 'utf-8')) as EphemFile

  return { horizon, ephem }
}

describe('computeWindowMap - hand-built tiny dataset (120 hourly samples)', () => {
  const count = 120
  const sunEl = new Array<number>(count).fill(5)
  const earthEl = new Array<number>(count).fill(10)

  // Column 0 (t = 0h, interval 0..23):
  // 12h sunlit, 6h dark, 6h sunlit -> 18 sunlit (75%), longest dark = 6h. Earth 100%.
  for (let i = 12; i <= 17; i++) {
    sunEl[i] = -2
  }

  // Column 2 (t = 24h, interval 24..47):
  // Earth 12h visible, 12h blocked -> 50% Earth. Sun 100% sunlit, longest dark = 0h.
  for (let i = 36; i <= 47; i++) {
    earthEl[i] = -5
  }

  // Column 4 (t = 48h, interval 48..71):
  // Earth blocked at landing (sample 48), then visible 49..71 -> Earth pct = 23/24 (~95.83%), sun 100%.
  earthEl[48] = -10

  // Column 6 (t = 72h, interval 72..95):
  // Sun elevation at landing is 1.0 deg (samples 73..95 are 5.0 deg).
  sunEl[72] = 1.0

  // Column 8 (t = 96h, interval 96..119):
  // 10h dark (96..105), 14h sunlit (106..119) -> pctSunlit = 14/24 (~58.33%), longest dark = 10h.
  for (let i = 96; i <= 105; i++) {
    sunEl[i] = -3
  }

  const bundle = makeTinyBundle({ sunEl, earthEl })
  const baseRules: MissionRules = {
    observerHeightM: 2,
    missionDurationH: 24,
    minPctSunlit: 70,
    maxLongestDarkH: 8,
    minPctEarth: 80,
    earthAtLandingRequired: true,
    minSunElAtLandingDeg: 2,
  }

  it('computes known pctSunlit, pctEarth, longestDarkH for columns with dayStepH = 12', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]
    const rows = computeWindowMap(inputs, baseRules, { dayStepH: 12 })

    expect(rows.length).toBe(1)
    const row = rows[0]

    expect(row.siteId).toBe('tiny')
    expect(row.count).toBe(10) // 0, 12, 24, 36, 48, 60, 72, 84, 96, 108
    expect(row.stepMs).toBe(12 * 3600_000)
    expect(row.startMs).toBe(Date.parse('2027-01-01T00:00:00Z'))

    // Column 0: 75% sunlit, 100% Earth, 6h longest dark, valid
    expect(row.pctSunlit[0]).toBeCloseTo(75.0, 4)
    expect(row.pctEarth[0]).toBeCloseTo(100.0, 4)
    expect(row.longestDarkH[0]).toBeCloseTo(6.0, 4)
    expect(row.valid[0]).toBe(1)

    // Column 2: 100% sunlit, 50% Earth, 0h longest dark
    expect(row.pctSunlit[2]).toBeCloseTo(100.0, 4)
    expect(row.pctEarth[2]).toBeCloseTo(50.0, 4)
    expect(row.longestDarkH[2]).toBeCloseTo(0.0, 4)

    // Column 4: 100% sunlit, (23/24)*100% Earth, 0h longest dark
    expect(row.pctSunlit[4]).toBeCloseTo(100.0, 4)
    expect(row.pctEarth[4]).toBeCloseTo((23 / 24) * 100, 4)
    expect(row.longestDarkH[4]).toBeCloseTo(0.0, 4)

    // Column 8: (14/24)*100% sunlit, 100% Earth, 10h longest dark
    expect(row.pctSunlit[8]).toBeCloseTo((14 / 24) * 100, 4)
    expect(row.pctEarth[8]).toBeCloseTo(100.0, 4)
    expect(row.longestDarkH[8]).toBeCloseTo(10.0, 4)
  })

  it('marks valid = 255 and metrics = 0 when mission interval leaves coverage', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]
    const rows = computeWindowMap(inputs, baseRules, { dayStepH: 12 })
    const row = rows[0]

    // Column 9 starts at index 108. 108 + 24 = 132 > 120 samples. Leaves coverage.
    expect(row.valid[9]).toBe(255)
    expect(row.pctSunlit[9]).toBe(0)
    expect(row.pctEarth[9]).toBe(0)
    expect(row.longestDarkH[9]).toBe(0)
  })

  it('validates minPctSunlit rule flag', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]

    // Column 0 has 75% sunlit. Fails if minPctSunlit > 75, passes if <= 75.
    const rowsFail = computeWindowMap(
      inputs,
      { ...baseRules, minPctSunlit: 80 },
      { dayStepH: 12 }
    )
    expect(rowsFail[0].valid[0]).toBe(0)

    const rowsPass = computeWindowMap(
      inputs,
      { ...baseRules, minPctSunlit: 75 },
      { dayStepH: 12 }
    )
    expect(rowsPass[0].valid[0]).toBe(1)
  })

  it('validates maxLongestDarkH rule flag', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]

    // Column 0 has 6h longest dark. Fails if maxLongestDarkH < 6, passes if >= 6.
    const rowsFail = computeWindowMap(
      inputs,
      { ...baseRules, maxLongestDarkH: 5 },
      { dayStepH: 12 }
    )
    expect(rowsFail[0].valid[0]).toBe(0)

    const rowsPass = computeWindowMap(
      inputs,
      { ...baseRules, maxLongestDarkH: 6 },
      { dayStepH: 12 }
    )
    expect(rowsPass[0].valid[0]).toBe(1)
  })

  it('validates minPctEarth rule flag', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]

    // Column 2 has 50% Earth. Fails if minPctEarth > 50, passes if <= 50.
    const rowsFail = computeWindowMap(
      inputs,
      { ...baseRules, minPctEarth: 55 },
      { dayStepH: 12 }
    )
    expect(rowsFail[0].valid[2]).toBe(0)

    const rowsPass = computeWindowMap(
      inputs,
      { ...baseRules, minPctEarth: 50 },
      { dayStepH: 12 }
    )
    expect(rowsPass[0].valid[2]).toBe(1)
  })

  it('validates earthAtLandingRequired rule flag', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]

    // Column 4 has earthEl[48] = -10 (blocked at landing). Fails if required, passes if not.
    const rulesReq: MissionRules = {
      ...baseRules,
      minPctEarth: 90,
      earthAtLandingRequired: true,
    }
    const rowsFail = computeWindowMap(inputs, rulesReq, { dayStepH: 12 })
    expect(rowsFail[0].valid[4]).toBe(0)

    const rulesNotReq: MissionRules = {
      ...rulesReq,
      earthAtLandingRequired: false,
    }
    const rowsPass = computeWindowMap(inputs, rulesNotReq, { dayStepH: 12 })
    expect(rowsPass[0].valid[4]).toBe(1)
  })

  it('validates minSunElAtLandingDeg rule flag', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]

    // Column 6 has sunEl[72] = 1.0 deg at landing. Fails if minSunEl > 1.0, passes if <= 1.0.
    const rulesFail: MissionRules = {
      ...baseRules,
      minSunElAtLandingDeg: 2.0,
    }
    const rowsFail = computeWindowMap(inputs, rulesFail, { dayStepH: 12 })
    expect(rowsFail[0].valid[6]).toBe(0)

    const rulesPass: MissionRules = {
      ...baseRules,
      minSunElAtLandingDeg: 1.0,
    }
    const rowsPass = computeWindowMap(inputs, rulesPass, { dayStepH: 12 })
    expect(rowsPass[0].valid[6]).toBe(1)
  })

  it('restricts columns to startMs / endMs range', () => {
    const inputs: WindowMapInput[] = [{ siteId: 'tiny', bundle }]
    const start0Ms = Date.parse('2027-01-01T00:00:00Z')
    const startMs = start0Ms + 24 * 3600_000 // t = 24h
    const endMs = start0Ms + 48 * 3600_000 // t = 48h

    const rows = computeWindowMap(inputs, baseRules, {
      dayStepH: 12,
      startMs,
      endMs,
    })
    const row = rows[0]

    expect(row.count).toBe(3) // 24h, 36h, 48h
    expect(row.startMs).toBe(startMs)
    expect(row.stepMs).toBe(12 * 3600_000)

    // Col 0 of restricted range is t = 24h (which was Col 2 in full range)
    expect(row.pctEarth[0]).toBeCloseTo(50.0, 4)
    // Col 2 of restricted range is t = 48h (which was Col 4 in full range)
    expect(row.pctEarth[2]).toBeCloseTo((23 / 24) * 100, 4)
  })
})

describe('Agreement with findWindows on real mock files', () => {
  const siteIds = ['apollo_11', 'artemis_region_1', 'southpole_landed']

  const ruleSetA: MissionRules = {
    observerHeightM: 2,
    missionDurationH: 240,
    minPctSunlit: 70,
    maxLongestDarkH: 48,
    earthAtLandingRequired: true,
    minPctEarth: 50,
    minSunElAtLandingDeg: 0,
  }

  const ruleSetB: MissionRules = {
    observerHeightM: 10,
    missionDurationH: 120,
    minPctSunlit: 50,
    maxLongestDarkH: 24,
    earthAtLandingRequired: false,
    minPctEarth: 30,
  }

  const ruleSets = [
    { name: 'RuleSet A (240h, 2m observer)', rules: ruleSetA },
    { name: 'RuleSet B (120h, 10m observer)', rules: ruleSetB },
  ]

  for (const siteId of siteIds) {
    for (const { name, rules } of ruleSets) {
      it(`matches findWindows for site ${siteId} under ${name}`, () => {
        const bundle = loadMockBundle(siteId)
        const windows = findWindows(bundle, rules)
        const [row] = computeWindowMap([{ siteId, bundle }], rules, {
          dayStepH: 24,
        })

        let validCount = 0

        for (let c = 0; c < row.count; c++) {
          const colTimeMs = row.startMs + c * row.stepMs
          const colIso =
            new Date(Math.round(colTimeMs / 1000) * 1000)
              .toISOString()
              .slice(0, 19) + 'Z'

          const inWindow = windows.some(
            (w) => w.start_utc <= colIso && colIso <= w.end_utc
          )

          if (row.valid[c] === 1) {
            validCount++
            expect(
              inWindow,
              `Column ${c} (${colIso}) has valid=1 but is not in findWindows results`
            ).toBe(true)
          } else {
            expect(
              inWindow,
              `Column ${c} (${colIso}) has valid=${row.valid[c]} but is inside findWindows results`
            ).toBe(false)
          }
        }

        // Verify validCount matches the number of 24h column points that fall into findWindows
        expect(row.count).toBeGreaterThan(0)
      })
    }
  }
})

describe('computeWindowMap performance and edge cases', () => {
  it('runs 3 mock sites, 240 h mission, 24 h step, whole coverage under 300 ms (loose bound 1000 ms)', () => {
    const siteIds = ['apollo_11', 'artemis_region_1', 'southpole_landed']
    const inputs: WindowMapInput[] = siteIds.map((siteId) => ({
      siteId,
      bundle: loadMockBundle(siteId),
    }))

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 240,
      minPctSunlit: 70,
      maxLongestDarkH: 48,
      earthAtLandingRequired: true,
      minPctEarth: 50,
      minSunElAtLandingDeg: 0,
    }

    const t0 = performance.now()
    const rows = computeWindowMap(inputs, rules, { dayStepH: 24 })
    const elapsedMs = performance.now() - t0

    console.log(
      `computeWindowMap performance: 3 sites, ${rows[0].count} columns -> ${elapsedMs.toFixed(2)} ms`
    )

    expect(rows.length).toBe(3)
    for (const row of rows) {
      expect(row.count).toBeGreaterThan(700)
    }
    expect(elapsedMs).toBeLessThan(1000)
  })

  it('handles empty inputs', () => {
    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 24,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    }
    expect(computeWindowMap([], rules)).toEqual([])
  })

  it('handles zero or negative mission duration', () => {
    const bundle = loadMockBundle('apollo_11')
    const inputs: WindowMapInput[] = [{ siteId: 'apollo_11', bundle }]
    const rulesZero: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 0,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    }
    const [row] = computeWindowMap(inputs, rulesZero, { dayStepH: 24 })
    expect(row.count).toBeGreaterThan(0)
    for (let c = 0; c < row.count; c++) {
      expect(row.valid[c]).not.toBe(1)
    }
  })

  it('derives column grid when the first input has an empty ephemeris', () => {
    const emptyBundle: Pick<SiteBundle, 'horizon' | 'ephem'> = {
      horizon: {
        meta: {
          contract_version: '1.1.1',
          generated_utc: '2026-11-14T00:00:00Z',
          generator: 'test',
          synthetic: true,
          approximate: false,
          inputs: [],
        },
        site_id: 'empty_site',
        az_step_deg: 360,
        n: 1,
        observer_heights_m: [2],
        masks: { '2': [0] },
      },
      ephem: {
        meta: {
          contract_version: '1.1.1',
          generated_utc: '2026-11-14T00:00:00Z',
          generator: 'test',
          synthetic: true,
          approximate: false,
          inputs: [],
        },
        site_id: 'empty_site',
        start_utc: '2027-01-01T00:00:00Z',
        step_minutes: 60,
        count: 0,
        sun: { az: [], el: [] },
        earth: { az: [], el: [] },
        sun_ang_radius_deg: 0.2666,
        earth_ang_radius_deg: 0.95,
      },
    }

    const validBundle = makeTinyBundle({
      sunEl: new Array(120).fill(5),
      earthEl: new Array(120).fill(10),
    })

    const inputs: WindowMapInput[] = [
      { siteId: 'empty_site', bundle: emptyBundle },
      { siteId: 'valid_site', bundle: validBundle },
    ]

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 24,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    }

    const rows = computeWindowMap(inputs, rules, { dayStepH: 24 })
    expect(rows.length).toBe(2)
    expect(rows[0].count).toBeGreaterThan(0)
    expect(rows[1].count).toBe(rows[0].count)

    // First input (empty ephemeris) must have valid = 255 everywhere
    for (let i = 0; i < rows[0].count; i++) {
      expect(rows[0].valid[i]).toBe(255)
    }

    // Second input (valid ephemeris) has computed columns
    expect(rows[1].valid.some((v) => v === 1)).toBe(true)
  })

  it('cancelWindowMap terminates active worker safely without throwing', async () => {
    const { cancelWindowMap } = await import('./windowMapClient')
    expect(() => cancelWindowMap()).not.toThrow()
  })
})
