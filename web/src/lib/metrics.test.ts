import { describe, expect, it } from 'vitest';
import type { EphemFile, HorizonFile, SiteBundle } from './types.ts';
import { bodyFraction, computeMetrics, pickMaskFor } from './metrics.ts';

function createMockHorizon(overrides?: Partial<HorizonFile>): HorizonFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    az_step_deg: 0.5,
    n: 720,
    observer_heights_m: [2],
    masks: {
      '2': new Array(720).fill(0),
    },
    ...overrides,
  };
}

function createMockEphem(overrides?: Partial<EphemFile>): EphemFile {
  return {
    meta: {
      contract_version: '1.1.1',
      generated_utc: '2026-11-14T00:00:00Z',
      generator: 'test',
      synthetic: true,
      approximate: false,
      inputs: [],
    },
    site_id: 'test_site',
    start_utc: '2026-12-01T00:00:00Z',
    step_minutes: 60,
    count: 8,
    sun: {
      az: [0, 10, 20, 30, 40, 50, 60, 70],
      el: [1, 2, 3, 2, 1, 0, -1, -2],
    },
    earth: {
      az: [100, 100, 100, 100, 100, 100, 100, 100],
      el: [5, 5, 5, 5, 5, 5, 5, 5],
    },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
    ...overrides,
  };
}

function createBundle(
  horizonOverrides?: Partial<HorizonFile>,
  ephemOverrides?: Partial<EphemFile>,
): Pick<SiteBundle, 'horizon' | 'ephem'> {
  return {
    horizon: createMockHorizon(horizonOverrides),
    ephem: createMockEphem(ephemOverrides),
  };
}

describe('bodyFraction', () => {
  const r = 0.5;

  it('gives 0.5 when clear is 0 (x = 0)', () => {
    expect(bodyFraction(0, r)).toBe(0.5);
  });

  it('gives 1 when clear >= r (x >= 1)', () => {
    expect(bodyFraction(r, r)).toBe(1.0);
    expect(bodyFraction(2 * r, r)).toBe(1.0);
  });

  it('gives 0 when clear <= -r (x <= -1)', () => {
    expect(bodyFraction(-r, r)).toBe(0.0);
    expect(bodyFraction(-2 * r, r)).toBe(0.0);
  });

  it('gives approx 0.8045 when clear = 0.5 * r', () => {
    const val = bodyFraction(0.5 * r, r);
    expect(val).toBeCloseTo(0.8045, 3);
  });

  it('handles radius <= 0', () => {
    expect(bodyFraction(1, 0)).toBe(1);
    expect(bodyFraction(-1, 0)).toBe(0);
  });
});

describe('computeMetrics', () => {
  it('detects a Sun sunset between two samples and computes the interpolated time', () => {
    const startMs = Date.parse('2026-12-01T00:00:00Z');
    const bundle = createBundle(
      {},
      {
        count: 8,
        sun: {
          az: [0, 10, 20, 30, 40, 50, 60, 70],
          // el drops from +1.0 to -1.0 between sample 0 and 1
          el: [1.0, -1.0, -2.0, -2.0, -2.0, -2.0, -2.0, -2.0],
        },
      },
    );

    const metrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs,
      endMs: startMs + 8 * 3600000,
      refMs: startMs,
    });

    expect(metrics).not.toBeNull();
    // Midpoint between 00:00 and 01:00 is 00:30:00Z
    expect(metrics?.next_sunset_utc).toBe('2026-12-01T00:30:00Z');
    expect(metrics?.time_to_sunset_h).toBe(0.5);
    expect(metrics?.gaps.sunset).toBeUndefined();
  });

  it('handles a body that never sets (null transition and beyond_data gap)', () => {
    const startMs = Date.parse('2026-12-01T00:00:00Z');
    // Sun and Earth never drop below 0
    const bundle = createBundle(
      {},
      {
        count: 8,
        sun: {
          az: [0, 10, 20, 30, 40, 50, 60, 70],
          el: [5, 5, 5, 5, 5, 5, 5, 5],
        },
        earth: {
          az: [0, 10, 20, 30, 40, 50, 60, 70],
          el: [10, 10, 10, 10, 10, 10, 10, 10],
        },
      },
    );

    const metrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs,
      endMs: startMs + 8 * 3600000,
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.next_sunset_utc).toBeNull();
    expect(metrics?.time_to_sunset_h).toBeNull();
    expect(metrics?.gaps.sunset).toBe('beyond_data');

    expect(metrics?.next_earthset_utc).toBeNull();
    expect(metrics?.time_to_earthset_h).toBeNull();
    expect(metrics?.gaps.earthset).toBe('beyond_data');
  });

  it('returns null for a window with no qualifying samples', () => {
    const startMs = Date.parse('2026-12-01T00:00:00Z');
    const bundle = createBundle();

    // Query completely before data coverage
    const beforeMetrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs: startMs - 10 * 3600000,
      endMs: startMs - 2 * 3600000,
    });
    expect(beforeMetrics).toBeNull();

    // Query with empty window (startMs === endMs)
    const emptyMetrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs: startMs + 3600000,
      endMs: startMs + 3600000,
    });
    expect(emptyMetrics).toBeNull();
  });

  it('computes metrics when window is partly outside coverage', () => {
    const startCov = Date.parse('2026-12-01T00:00:00Z');
    const bundle = createBundle();

    // Query window starts 2h before coverage, ends 2h into coverage
    // Qualifying samples: k=0 (00:00), k=1 (01:00) => N = 2
    const metrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs: startCov - 2 * 3600000,
      endMs: startCov + 2 * 3600000,
    });

    expect(metrics).not.toBeNull();
    // refMs defaults to startMs (which was before coverage), so clamped to start of coverage (sample 0)
    // sample 0 has sun.el = 1
    expect(metrics?.sun_el_deg).toBe(1);
    expect(Number.isNaN(metrics?.sun_el_deg)).toBe(false);
  });

  it('computes longest_dark_h correctly across runs of consecutive dark samples', () => {
    const startMs = Date.parse('2026-12-01T00:00:00Z');
    const bundle = createBundle(
      {},
      {
        count: 8,
        sun: {
          az: [0, 10, 20, 30, 40, 50, 60, 70],
          // k=0: +1 (lit)
          // k=1..3: -1 (dark, length 3)
          // k=4: +1 (lit)
          // k=5..6: -1 (dark, length 2)
          // k=7: +1 (lit)
          el: [1, -1, -1, -1, 1, -1, -1, 1],
        },
      },
    );

    const metrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs,
      endMs: startMs + 8 * 3600000,
    });

    expect(metrics).not.toBeNull();
    // 3 consecutive dark hours
    expect(metrics?.longest_dark_h).toBe(3);
    // 3 lit samples out of 8 => 37.5%
    expect(metrics?.pct_sunlit).toBe(37.5);
  });

  it('computes half-cut disc where clear = 0 gives frac = 0.5', () => {
    const startMs = Date.parse('2026-12-01T00:00:00Z');
    const bundle = createBundle(
      {},
      {
        count: 8,
        sun: {
          az: [0, 10, 20, 30, 40, 50, 60, 70],
          // All samples clear = 0 (el = 0 against flat 0 horizon)
          el: [0, 0, 0, 0, 0, 0, 0, 0],
        },
      },
    );

    const metrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs,
      endMs: startMs + 8 * 3600000,
    });

    expect(metrics).not.toBeNull();
    // clear = 0 is sunlit (clear >= 0)
    expect(metrics?.pct_sunlit).toBe(100);
    // mean sun fraction should be 50%
    expect(metrics?.mean_sun_frac).toBe(50);
  });

  it('handles azimuth wrap across 359.5 to 0.5', () => {
    const startMs = Date.parse('2026-12-01T00:00:00Z');
    const mask = new Array(720).fill(1.0); // uniform 1.0 deg horizon
    const bundle = createBundle(
      { masks: { '2': mask } },
      {
        count: 8,
        sun: {
          // sample 0 is at 359.5, sample 1 is at 0.5
          az: [359.5, 0.5, 10, 20, 30, 40, 50, 60],
          el: [3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0],
        },
      },
    );

    // refMs at midpoint (30 min in): sun az interpolates to 0.0 deg
    // horizon at 0.0 is 1.0 deg. Sun el is 3.0 deg => clearance is 2.0 deg
    const metrics = computeMetrics(bundle, {
      observerHeightM: 2,
      startMs,
      endMs: startMs + 8 * 3600000,
      refMs: startMs + 1800000,
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.sun_clearance_deg).toBeCloseTo(2.0);
  });

  describe('pickMaskFor fallback pattern', () => {
    it('picks matching observer height mask when present', () => {
      const horizon = {
        masks: { '2': [2.0], '10': [10.0] },
      };
      expect(pickMaskFor(horizon, 10)).toEqual([10.0]);
      expect(pickMaskFor(horizon, 2)).toEqual([2.0]);
    });

    it('falls back to 2m mask if requested height is missing', () => {
      const horizon = {
        masks: { '2': [2.0] },
      };
      expect(pickMaskFor(horizon, 10)).toEqual([2.0]);
    });

    it('falls back to first available mask if both requested and 2m are missing', () => {
      const horizon = {
        masks: { '10': [10.0] },
      };
      expect(pickMaskFor(horizon, 2)).toEqual([10.0]);
    });

    it('falls back to flat 0 mask [] when masks is empty or null', () => {
      expect(pickMaskFor({ masks: {} }, 2)).toEqual([]);
      expect(pickMaskFor(null, 2)).toEqual([]);
    });
  });

  describe('time_to_sunset_h and time_to_earthset_h non-negative and normalized', () => {
    it('never produces negative numbers or -0 even when refMs is close to event', () => {
      const startMs = Date.parse('2026-12-01T00:00:00Z');
      // Sun drops below horizon between sample 0 and 1
      const bundle = createBundle(
        { masks: { '2': [0] }, az_step_deg: 360, n: 1 },
        {
          count: 4,
          sun: {
            az: [0, 0, 0, 0],
            el: [0.0001, -0.0001, -1, -2],
          },
          earth: {
            az: [0, 0, 0, 0],
            el: [0.0001, -0.0001, -1, -2],
          },
        },
      );

      // refMs is slightly ahead of the second boundary (e.g. 500 ms)
      const metrics = computeMetrics(bundle, {
        observerHeightM: 2,
        startMs,
        endMs: startMs + 4 * 3600000,
        refMs: startMs + 1800000, // half hour in, right around transition
      });

      expect(metrics).not.toBeNull();
      if (metrics && metrics.time_to_sunset_h !== null) {
        expect(metrics.time_to_sunset_h).toBeGreaterThanOrEqual(0);
        expect(Object.is(metrics.time_to_sunset_h, -0)).toBe(false);
      }
      if (metrics && metrics.time_to_earthset_h !== null) {
        expect(metrics.time_to_earthset_h).toBeGreaterThanOrEqual(0);
        expect(Object.is(metrics.time_to_earthset_h, -0)).toBe(false);
      }
    });
  });
});
