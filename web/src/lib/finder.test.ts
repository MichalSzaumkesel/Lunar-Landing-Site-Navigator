import { describe, expect, it } from 'vitest';
import type { MissionRules, SiteBundle } from './types';
import { evaluateMissionRulesAt, findWindows } from './finder';
import { computeWindowMap, windowsFromRow } from './windowMap';
import { evaluateMissionRulesAt as missionBarEvaluate } from '../components/timeline/missionBar';

function makeBundle(opts: {
  sunEl: number[];
  earthEl: number[];
  sunAz?: number[];
  earthAz?: number[];
  startUtc?: string;
  stepMinutes?: number;
  masks?: Record<string, number[]>;
  azStepDeg?: number;
}): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const count = opts.sunEl.length;
  const sunAz = opts.sunAz ?? new Array(count).fill(0);
  const earthAz = opts.earthAz ?? new Array(count).fill(0);
  const startUtc = opts.startUtc ?? '2027-01-01T00:00:00Z';
  const stepMinutes = opts.stepMinutes ?? 60;
  const azStepDeg = opts.azStepDeg ?? 1;

  const defaultMask = new Array(360).fill(0);
  const masks = opts.masks ?? {
    '2': defaultMask,
    '10': defaultMask,
  };

  return {
    horizon: {
      meta: {
        contract_version: '1.0.0',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'test_site',
      az_step_deg: azStepDeg,
      n: defaultMask.length,
      observer_heights_m: [2, 10],
      masks,
    },
    ephem: {
      meta: {
        contract_version: '1.0.0',
        generated_utc: '2026-11-14T00:00:00Z',
        generator: 'test',
        synthetic: true,
        approximate: false,
        inputs: [],
      },
      site_id: 'test_site',
      start_utc: startUtc,
      step_minutes: stepMinutes,
      count,
      sun: { az: sunAz, el: opts.sunEl },
      earth: { az: earthAz, el: opts.earthEl },
      sun_ang_radius_deg: 0.2666,
      earth_ang_radius_deg: 0.95,
    },
  };
}

describe('findWindows', () => {
  it('all rules pass everywhere (one window covering the allowed range)', () => {
    const sunEl = new Array(48).fill(10);
    const earthEl = new Array(48).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 24,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: true,
      minPctEarth: 50,
    };

    const windows = findWindows(bundle, rules);
    expect(windows).toEqual([
      {
        start_utc: '2027-01-01T00:00:00Z',
        end_utc: '2027-01-02T00:00:00Z',
      },
    ]);
  });

  it('a Sun that is below the horizon for a stretch (maxLongestDarkH and minPctSunlit cut candidates)', () => {
    // 48 hours total; darkness from k=10 to k=15 (6 hours of night)
    const sunEl = new Array(48).fill(10);
    for (let k = 10; k <= 15; k++) {
      sunEl[k] = -10;
    }
    const earthEl = new Array(48).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    // Test maxLongestDarkH cutting candidates:
    // missionDurationH = 12. Candidate window is [k .. k + 11].
    // k=0 has dark samples at 10, 11 (run of 2).
    // k=1 has dark samples at 10, 11, 12 (run of 3).
    // k=2 has dark samples at 10, 11, 12, 13 (run of 4).
    // With maxLongestDarkH = 3, k=2 fails, k=0 and k=1 pass.
    // Darkness ends at k=15.
    // For k=13: window [13..24] has dark samples at 13, 14, 15 (run of 3 <= 3). Pass!
    // Coverage ends at 47, so last candidate with full coverage is 47 - 12 + 1 = 36.
    const darkRules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 12,
      minPctSunlit: 50,
      maxLongestDarkH: 3,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };

    const darkWindows = findWindows(bundle, darkRules);
    expect(darkWindows).toEqual([
      {
        start_utc: '2027-01-01T00:00:00Z',
        end_utc: '2027-01-01T01:00:00Z',
      },
      {
        start_utc: '2027-01-01T13:00:00Z',
        end_utc: '2027-01-02T12:00:00Z',
      },
    ]);

    // Test minPctSunlit cutting candidates:
    // With minPctSunlit = 80%, at least 10 out of 12 samples must be sunlit (max 2 dark).
    // k=0 has 2 dark samples (10/12 = 83.33% >= 80%). Pass!
    // k=1 has 3 dark samples (9/12 = 75% < 80%). Fails!
    // k=14 has 2 dark samples (10/12 = 83.33% >= 80%). Pass!
    const pctRules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 12,
      minPctSunlit: 80,
      maxLongestDarkH: 10,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };

    const pctWindows = findWindows(bundle, pctRules);
    expect(pctWindows).toEqual([
      {
        start_utc: '2027-01-01T00:00:00Z',
        end_utc: '2027-01-01T00:00:00Z',
      },
      {
        start_utc: '2027-01-01T14:00:00Z',
        end_utc: '2027-01-02T12:00:00Z',
      },
    ]);
  });

  it('earthAtLandingRequired with Earth rising halfway', () => {
    // 30 hours total. Earth below horizon for k=0..9, above horizon for k=10..29.
    const sunEl = new Array(30).fill(10);
    const earthEl = new Array(30).fill(-10);
    for (let k = 10; k < 30; k++) {
      earthEl[k] = 10;
    }
    const bundle = makeBundle({ sunEl, earthEl });

    const rulesRequired: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 6,
      minPctSunlit: 0,
      maxLongestDarkH: 24,
      earthAtLandingRequired: true,
      minPctEarth: 50,
    };

    // Candidate k needs earth_in_view(k), so k < 10 must fail.
    // For k=10..24, earth is in view at landing and 100% of the 6h window.
    const windowsRequired = findWindows(bundle, rulesRequired);
    expect(windowsRequired).toEqual([
      {
        start_utc: '2027-01-01T10:00:00Z',
        end_utc: '2027-01-02T00:00:00Z',
      },
    ]);

    // When not required, k=7 has window [7..12] with Earth in view at 10, 11, 12 (3/6 = 50% >= 50%)
    const rulesNotRequired: MissionRules = {
      ...rulesRequired,
      earthAtLandingRequired: false,
    };

    const windowsNotRequired = findWindows(bundle, rulesNotRequired);
    expect(windowsNotRequired).toEqual([
      {
        start_utc: '2027-01-01T07:00:00Z',
        end_utc: '2027-01-02T00:00:00Z',
      },
    ]);
  });

  it('minSunElAtLandingDeg', () => {
    // Elevation increases from 0 to 29
    const sunEl = Array.from({ length: 30 }, (_, k) => k);
    const earthEl = new Array(30).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 6,
      minPctSunlit: 0,
      maxLongestDarkH: 24,
      earthAtLandingRequired: false,
      minPctEarth: 0,
      minSunElAtLandingDeg: 5,
    };

    // Candidates k < 5 fail because sun.el[k] < 5
    // k=5..24 pass (coverage ends at 29, so 29 - 6 + 1 = 24)
    const windows = findWindows(bundle, rules);
    expect(windows).toEqual([
      {
        start_utc: '2027-01-01T05:00:00Z',
        end_utc: '2027-01-02T00:00:00Z',
      },
    ]);
  });

  it('a mission longer than the remaining coverage (late candidates are dropped)', () => {
    const sunEl = new Array(24).fill(10);
    const earthEl = new Array(24).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 10,
      minPctSunlit: 0,
      maxLongestDarkH: 24,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };

    // 24 samples: indices 0..23.
    // With n=10: last valid candidate is k = 23 - 10 + 1 = 14.
    const windows = findWindows(bundle, rules);
    expect(windows).toEqual([
      {
        start_utc: '2027-01-01T00:00:00Z',
        end_utc: '2027-01-01T14:00:00Z',
      },
    ]);

    // If mission duration is longer than the entire coverage (e.g. 25h vs 24 samples), returns []
    const longRules: MissionRules = {
      ...rules,
      missionDurationH: 25,
    };
    expect(findWindows(bundle, longRules)).toEqual([]);
  });

  it('two separate windows', () => {
    // 40 hours. Night from k=12 to k=15 (4 hours).
    const sunEl = new Array(40).fill(10);
    for (let k = 12; k <= 15; k++) {
      sunEl[k] = -10;
    }
    const earthEl = new Array(40).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    // missionDurationH = 4. maxLongestDarkH = 0 (no darkness allowed).
    // For k=0..8: window [k .. k + 3] has no dark samples.
    // For k=9: window [9..12] hits k=12 (dark).
    // For k=16..36: window [k .. k + 3] has no dark samples (39 - 4 + 1 = 36).
    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 4,
      minPctSunlit: 100,
      maxLongestDarkH: 0,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };

    const windows = findWindows(bundle, rules);
    expect(windows).toEqual([
      {
        start_utc: '2027-01-01T00:00:00Z',
        end_utc: '2027-01-01T08:00:00Z',
      },
      {
        start_utc: '2027-01-01T16:00:00Z',
        end_utc: '2027-01-02T12:00:00Z',
      },
    ]);
  });

  it('range limiting the candidates', () => {
    const sunEl = new Array(48).fill(10);
    const earthEl = new Array(48).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 24,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: true,
      minPctEarth: 50,
    };

    // Sub-range inside valid candidates: T_5 to T_10
    const startMs = Date.parse('2027-01-01T05:00:00Z');
    const endMs = Date.parse('2027-01-01T10:00:00Z');
    const windows = findWindows(bundle, rules, { startMs, endMs });
    expect(windows).toEqual([
      {
        start_utc: '2027-01-01T05:00:00Z',
        end_utc: '2027-01-01T10:00:00Z',
      },
    ]);

    // Range where candidates cannot complete mission inside coverage (e.g. k=26..30)
    const lateStartMs = Date.parse('2027-01-02T02:00:00Z');
    const lateEndMs = Date.parse('2027-01-02T06:00:00Z');
    expect(
      findWindows(bundle, rules, { startMs: lateStartMs, endMs: lateEndMs }),
    ).toEqual([]);

    // Range completely outside coverage
    const outsideStartMs = Date.parse('2027-01-05T00:00:00Z');
    const outsideEndMs = Date.parse('2027-01-06T00:00:00Z');
    expect(
      findWindows(bundle, rules, {
        startMs: outsideStartMs,
        endMs: outsideEndMs,
      }),
    ).toEqual([]);
  });

  it('missionDurationH = 0 returns []', () => {
    const sunEl = new Array(24).fill(10);
    const earthEl = new Array(24).fill(10);
    const bundle = makeBundle({ sunEl, earthEl });

    const rulesZero: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 0,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };
    expect(findWindows(bundle, rulesZero)).toEqual([]);

    const rulesNeg: MissionRules = {
      ...rulesZero,
      missionDurationH: -5,
    };
    expect(findWindows(bundle, rulesNeg)).toEqual([]);
  });

  it('the 10 m mask being used when requested', () => {
    const count = 24;
    const sunEl = new Array(count).fill(3);
    const earthEl = new Array(count).fill(10);

    // Height 2m horizon is 5 deg (Sun at 3 deg is below horizon -> not sunlit)
    // Height 10m horizon is 1 deg (Sun at 3 deg is above horizon -> sunlit)
    const bundle = makeBundle({
      sunEl,
      earthEl,
      masks: {
        '2': [5],
        '10': [1],
      },
      azStepDeg: 360,
    });

    const rules2m: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 6,
      minPctSunlit: 100,
      maxLongestDarkH: 0,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };
    expect(findWindows(bundle, rules2m)).toEqual([]);

    const rules10m: MissionRules = {
      ...rules2m,
      observerHeightM: 10,
    };
    expect(findWindows(bundle, rules10m)).toEqual([
      {
        start_utc: '2027-01-01T00:00:00Z',
        end_utc: '2027-01-01T18:00:00Z',
      },
    ]);
  });

  it('handles edge cases: count=0 and fallback masks', () => {
    const emptyBundle = makeBundle({ sunEl: [], earthEl: [] });
    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 12,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: false,
      minPctEarth: 0,
    };
    expect(findWindows(emptyBundle, rules)).toEqual([]);

    // Mask fallback: requested 10m missing, falls back to 2m
    const fallbackBundle = makeBundle({
      sunEl: new Array(24).fill(10),
      earthEl: new Array(24).fill(10),
      masks: {
        '2': [0],
      },
      azStepDeg: 360,
    });
    const rulesFallback: MissionRules = {
      ...rules,
      observerHeightM: 10,
    };
    const res = findWindows(fallbackBundle, rulesFallback);
    expect(res.length).toBe(1);
  });

  it('performance test on 18288-sample ephemeris (< 500 ms)', () => {
    const count = 18288;
    const sunEl = new Array<number>(count);
    const sunAz = new Array<number>(count);
    const earthEl = new Array<number>(count);
    const earthAz = new Array<number>(count);

    for (let k = 0; k < count; k++) {
      sunAz[k] = (k * 360) / 708 % 360;
      sunEl[k] = 10 * Math.sin((k * 2 * Math.PI) / 708);
      earthAz[k] = (k * 360) / 655 % 360;
      earthEl[k] = 5 + 3 * Math.cos((k * 2 * Math.PI) / 655);
    }

    const bundle = makeBundle({
      sunEl,
      earthEl,
      sunAz,
      earthAz,
    });

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 240,
      minPctSunlit: 70,
      maxLongestDarkH: 48,
      earthAtLandingRequired: true,
      minPctEarth: 50,
      minSunElAtLandingDeg: 0,
    };

    const t0 = performance.now();
    const windows = findWindows(bundle, rules);
    const durationMs = performance.now() - t0;

    console.log(`findWindows (18288 samples, 240h duration): ${durationMs.toFixed(2)} ms`);
    expect(Array.isArray(windows)).toBe(true);
    expect(windows.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(500);
  });

  it('finder, window map, and mission bar agree for candidate starts, including where raw elevation passes but clearance fails (L2 #1)', () => {
    // Horizon mask is +5.0 deg everywhere.
    // k=0: Sun raw el = +2.0 deg (passes raw > 1.0 deg, but clearance = 2 - 5 = -3.0 deg < 1.0 deg -> FAILS)
    // k=1: Sun raw el = +8.0 deg (clearance = 8 - 5 = +3.0 deg >= 1.0 deg -> PASSES)
    // k=2..10: Sun raw el = +8.0 deg (clearance = +3.0 deg)
    const count = 10;
    const sunEl = [2, 8, 8, 8, 8, 8, 8, 8, 8, 8];
    const earthEl = new Array(count).fill(15);
    const startUtc = '2027-01-01T00:00:00Z';
    const t0 = Date.parse(startUtc);

    const bundle = makeBundle({
      sunEl,
      earthEl,
      masks: {
        '2': new Array(360).fill(5),
        '10': new Array(360).fill(5),
      },
      startUtc,
    });

    const fullBundle: SiteBundle = {
      site: {
        id: 'test_site',
        name: 'Test Site',
        category: 'custom',
        mission: null,
        agency: null,
        country: null,
        lat_deg: -89.9,
        lon_deg: 0,
        elevation_m: null,
        landing_date_utc: null,
        status: 'planned',
        region_radius_km: null,
        source: { title: 'Test', url: 'https://example.com' },
        notes: '',
      },
      horizon: bundle.horizon,
      ephem: bundle.ephem,
      terrain: null,
      provenance: 'mock',
      synthetic: true,
      approximate: false,
    };

    const rules: MissionRules = {
      observerHeightM: 2,
      missionDurationH: 3,
      minPctSunlit: 50,
      maxLongestDarkH: 12,
      earthAtLandingRequired: true,
      minPctEarth: 50,
      minSunElAtLandingDeg: 1.0,
    };

    // 1. Evaluate start k=0 (t0):
    // Raw elevation is +2.0 deg >= 1.0 deg, but clearance is -3.0 deg < 1.0 deg.
    const finderRes0 = evaluateMissionRulesAt(bundle, rules, t0);
    const missionBarRes0 = missionBarEvaluate(bundle, rules, t0);
    expect(finderRes0.valid).toBe(false);
    expect(finderRes0.failingRule).toBe('Sun elevation at landing');
    expect(missionBarRes0.valid).toBe(false);
    expect(missionBarRes0.failingRule).toBe('Sun elevation at landing');

    // 2. Evaluate start k=1 (t0 + 1h):
    // Raw elevation is +8.0 deg, clearance is +3.0 deg >= 1.0 deg. All 3 hours are sunlit.
    const t1 = t0 + 3_600_000;
    const finderRes1 = evaluateMissionRulesAt(bundle, rules, t1);
    const missionBarRes1 = missionBarEvaluate(bundle, rules, t1);
    expect(finderRes1.valid).toBe(true);
    expect(finderRes1.failingRule).toBeNull();
    expect(missionBarRes1.valid).toBe(true);
    expect(missionBarRes1.failingRule).toBeNull();

    // 3. Evaluate computeWindowMap with 1-hour column step:
    const rows = computeWindowMap(
      [{ siteId: 'test_site', bundle: fullBundle }],
      rules,
      { dayStepH: 1 },
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // Cell 0 (k=0) must be 0 (invalid due to clearance failing)
    expect(row.valid[0]).toBe(0);
    // Cell 1 (k=1) must be 1 (valid)
    expect(row.valid[1]).toBe(1);

    // 4. Evaluate findWindows:
    const windows = findWindows(bundle, rules);
    // Start at k=0 must NOT be in any window; window must start at k=1 (2027-01-01T01:00:00Z)
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].start_utc).toBe('2027-01-01T01:00:00Z');

    // 5. windowsFromRow must produce the exact same windows as findWindows
    const mapWindows = windowsFromRow(row);
    expect(mapWindows).toEqual(windows);
  });
});
