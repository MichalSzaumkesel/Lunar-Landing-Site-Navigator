import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EphemFile, HorizonFile, SiteBundle } from './types';
import { ephemCoverage } from './ephem';
import { computeMetrics } from './metrics';
import { listSkyEvents, longestStretches } from './events';

function createHandBuiltBundle(): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const count = 16;
  const startUtc = '2027-01-01T00:00:00Z';
  const stepMinutes = 60;

  // Mask '2' is flat 0 deg.
  // Mask '10' is flat 1.5 deg, causing sunset between k=0 and k=1 instead of k=1 and k=2.
  const mask2 = new Array(360).fill(0);
  const mask10 = new Array(360).fill(1.5);

  // k=0: el=2 (clear=2 vs 0)
  // k=1: el=1 (clear=1 vs 0)
  // k=2: el=-1 (clear=-1 vs 0) -> sunset at t_1 + 0.5h = 01:30:00Z
  // k=3: el=-2
  // k=4: el=-1
  // k=5: el=1 -> sunrise at t_4 + 0.5h = 04:30:00Z
  // k=6..15: el=2
  const sunEl = [2, 1, -1, -2, -1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  const sunAz = new Array(count).fill(0);

  // Earth never sets: el = 20 deg for all samples
  const earthEl = new Array(count).fill(20);
  const earthAz = new Array(count).fill(90);

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
      site_id: 'hand_built',
      az_step_deg: 1,
      n: 360,
      observer_heights_m: [2, 10],
      masks: {
        '2': mask2,
        '10': mask10,
      },
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
      site_id: 'hand_built',
      start_utc: startUtc,
      step_minutes: stepMinutes,
      count,
      sun: { az: sunAz, el: sunEl },
      earth: { az: earthAz, el: earthEl },
      sun_ang_radius_deg: 0.2666,
      earth_ang_radius_deg: 0.95,
    },
  };
}

function loadMockBundle(siteId: string): Pick<SiteBundle, 'horizon' | 'ephem'> {
  const baseDir = path.resolve(process.cwd(), 'public/data/mock');
  const horizonPath = path.join(baseDir, 'horizon', `${siteId}.json`);
  const ephemPath = path.join(baseDir, 'ephem', `${siteId}.json`);
  const horizon = JSON.parse(
    fs.readFileSync(horizonPath, 'utf8'),
  ) as HorizonFile;
  const ephem = JSON.parse(fs.readFileSync(ephemPath, 'utf8')) as EphemFile;
  return { horizon, ephem };
}

describe('listSkyEvents - hand-built ephemeris', () => {
  it('detects one sunset, one sunrise, and no Earth events for never-setting Earth', () => {
    const bundle = createHandBuiltBundle();
    const t0 = Date.parse('2027-01-01T00:00:00Z');
    const endMs = t0 + 16 * 3_600_000;

    const events = listSkyEvents(bundle, 2, t0, endMs);
    expect(events).toHaveLength(2);

    expect(events[0]).toEqual({
      kind: 'sunset',
      ms: t0 + 1.5 * 3_600_000,
      utc: '2027-01-01T01:30:00Z',
    });

    expect(events[1]).toEqual({
      kind: 'sunrise',
      ms: t0 + 4.5 * 3_600_000,
      utc: '2027-01-01T04:30:00Z',
    });

    const earthEvents = events.filter(
      (e) => e.kind === 'earthset' || e.kind === 'earthrise',
    );
    expect(earthEvents).toHaveLength(0);
  });

  it('excludes an event exactly at endMs and includes an event exactly at startMs', () => {
    const bundle = createHandBuiltBundle();
    const t0 = Date.parse('2027-01-01T00:00:00Z');
    const sunsetMs = t0 + 1.5 * 3_600_000;

    // Window ending exactly at sunset time: sunset is excluded
    const beforeSunset = listSkyEvents(bundle, 2, t0, sunsetMs);
    expect(beforeSunset).toHaveLength(0);

    // Window starting exactly at sunset time: sunset is included
    const fromSunset = listSkyEvents(
      bundle,
      2,
      sunsetMs,
      t0 + 3 * 3_600_000,
    );
    expect(fromSunset).toHaveLength(1);
    expect(fromSunset[0].kind).toBe('sunset');
    expect(fromSunset[0].ms).toBe(sunsetMs);
  });

  it('uses 10 m mask when requested', () => {
    const bundle = createHandBuiltBundle();
    const t0 = Date.parse('2027-01-01T00:00:00Z');
    const endMs = t0 + 16 * 3_600_000;

    // For mask '10', horizon is 1.5 deg.
    // k=0: el=2 -> clear = +0.5
    // k=1: el=1 -> clear = -0.5
    // frac = 0.5 / (0.5 - (-0.5)) = 0.5 -> sunset at 00:30:00Z
    const events10m = listSkyEvents(bundle, 10, t0, endMs);
    const sunset10m = events10m.find((e) => e.kind === 'sunset');
    expect(sunset10m).toBeDefined();
    expect(sunset10m?.utc).toBe('2027-01-01T00:30:00Z');
  });
});

describe('longestStretches - unit tests', () => {
  it('identifies longest dark run and breaks ties with first longest run', () => {
    const count = 12;
    const startUtc = '2027-01-01T00:00:00Z';
    // Two runs of dark samples of length 3:
    // k=1,2,3 (length 3, start k=1)
    // k=4 (lit)
    // k=5,6,7 (length 3, start k=5)
    // First longest (k=1..3) should win the tie.
    const sunEl = [1, -1, -1, -1, 1, -1, -1, -1, 1, 1, 1, 1];
    const earthEl = new Array(count).fill(10);
    const bundle: Pick<SiteBundle, 'horizon' | 'ephem'> = {
      horizon: {
        meta: {
          contract_version: '1.1.1',
          generated_utc: '2026-11-14T00:00:00Z',
          generator: 'test',
          synthetic: true,
          approximate: false,
          inputs: [],
        },
        site_id: 'test',
        az_step_deg: 1,
        n: 360,
        observer_heights_m: [2],
        masks: { '2': new Array(360).fill(0) },
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
        site_id: 'test',
        start_utc: startUtc,
        step_minutes: 60,
        count,
        sun: { az: new Array(count).fill(0), el: sunEl },
        earth: { az: new Array(count).fill(0), el: earthEl },
        sun_ang_radius_deg: 0.2666,
        earth_ang_radius_deg: 0.95,
      },
    };

    const t0 = Date.parse(startUtc);
    const stretches = longestStretches(bundle, 2, t0, t0 + 12 * 3_600_000);
    expect(stretches).toHaveLength(1); // longest_no_earth omitted since Earth is always lit
    expect(stretches[0]).toEqual({
      kind: 'longest_dark',
      startMs: t0 + 1 * 3_600_000,
      endMs: t0 + 4 * 3_600_000,
      hours: 3,
    });
  });

  it('omits stretch kinds when no below-horizon samples exist', () => {
    const count = 5;
    const startUtc = '2027-01-01T00:00:00Z';
    const bundle: Pick<SiteBundle, 'horizon' | 'ephem'> = {
      horizon: {
        meta: {
          contract_version: '1.1.1',
          generated_utc: '2026-11-14T00:00:00Z',
          generator: 'test',
          synthetic: true,
          approximate: false,
          inputs: [],
        },
        site_id: 'test',
        az_step_deg: 1,
        n: 360,
        observer_heights_m: [2],
        masks: { '2': new Array(360).fill(0) },
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
        site_id: 'test',
        start_utc: startUtc,
        step_minutes: 60,
        count,
        sun: { az: new Array(count).fill(0), el: [5, 5, 5, 5, 5] },
        earth: { az: new Array(count).fill(0), el: [10, 10, 10, 10, 10] },
        sun_ang_radius_deg: 0.2666,
        earth_ang_radius_deg: 0.95,
      },
    };

    const t0 = Date.parse(startUtc);
    const stretches = longestStretches(bundle, 2, t0, t0 + 5 * 3_600_000);
    expect(stretches).toEqual([]);
  });
});

describe('regression on mock files', () => {
  it('counts 26 sunsets for apollo_11, 97 for southpole_landed, 50 for artemis_region_1', () => {
    const apollo = loadMockBundle('apollo_11');
    const apolloCov = ephemCoverage(apollo.ephem);
    const apolloEvents = listSkyEvents(
      apollo,
      2,
      apolloCov.startMs,
      apolloCov.endMs,
    );
    const apolloSunsets = apolloEvents.filter((e) => e.kind === 'sunset');
    expect(apolloSunsets).toHaveLength(26);

    const southpole = loadMockBundle('southpole_landed');
    const southpoleCov = ephemCoverage(southpole.ephem);
    const southpoleEvents = listSkyEvents(
      southpole,
      2,
      southpoleCov.startMs,
      southpoleCov.endMs,
    );
    const southpoleSunsets = southpoleEvents.filter((e) => e.kind === 'sunset');
    expect(southpoleSunsets).toHaveLength(97);

    const artemis = loadMockBundle('artemis_region_1');
    const artemisCov = ephemCoverage(artemis.ephem);
    const artemisEvents = listSkyEvents(
      artemis,
      2,
      artemisCov.startMs,
      artemisCov.endMs,
    );
    const artemisSunsets = artemisEvents.filter((e) => e.kind === 'sunset');
    expect(artemisSunsets).toHaveLength(50);
  });

  it('has no Earth events for apollo_11', () => {
    const apollo = loadMockBundle('apollo_11');
    const apolloCov = ephemCoverage(apollo.ephem);
    const apolloEvents = listSkyEvents(
      apollo,
      2,
      apolloCov.startMs,
      apolloCov.endMs,
    );
    const earthEvents = apolloEvents.filter(
      (e) => e.kind === 'earthset' || e.kind === 'earthrise',
    );
    expect(earthEvents).toHaveLength(0);
  });

  it('matches computeMetrics next_sunset_utc for the first sunset after 2027-08-30T00:00:00Z', () => {
    const refMs = Date.parse('2027-08-30T00:00:00Z');
    for (const siteId of [
      'apollo_11',
      'southpole_landed',
      'artemis_region_1',
    ]) {
      const bundle = loadMockBundle(siteId);
      const cov = ephemCoverage(bundle.ephem);
      const metrics = computeMetrics(bundle, {
        observerHeightM: 2,
        startMs: refMs,
        endMs: cov.endMs,
        refMs,
      });
      const eventsAfterRef = listSkyEvents(bundle, 2, refMs, cov.endMs);
      const firstSunset = eventsAfterRef.find((e) => e.kind === 'sunset');

      expect(firstSunset).toBeDefined();
      expect(firstSunset?.utc).toBe(metrics?.next_sunset_utc);
    }
  });

  it('longestStretches over full coverage for southpole_landed reports >= 24h and matches computeMetrics longest_dark_h', () => {
    const sp = loadMockBundle('southpole_landed');
    const spCov = ephemCoverage(sp.ephem);
    const stretches = longestStretches(sp, 2, spCov.startMs, spCov.endMs);
    const longestDark = stretches.find((s) => s.kind === 'longest_dark');

    expect(longestDark).toBeDefined();
    expect(longestDark!.hours).toBeGreaterThanOrEqual(24);

    const spMetrics = computeMetrics(sp, {
      observerHeightM: 2,
      startMs: spCov.startMs,
      endMs: spCov.endMs,
    });
    expect(spMetrics).not.toBeNull();
    expect(longestDark!.hours).toBe(spMetrics?.longest_dark_h);
  });

  it('filters out phantom grazing pairs where clearance touches 0 from below (L4 #1)', () => {
    // 5 samples: clearance [-1, 0, -1, -2, -3]
    // Grazing at index 1: clearance touches 0 from below and immediately returns below.
    const count = 5;
    const t0 = Date.parse('2027-01-01T00:00:00Z');
    const bundle: Pick<SiteBundle, 'horizon' | 'ephem'> = {
      horizon: {
        meta: { contract_version: '1.1.1', generated_utc: '', generator: '', synthetic: true, approximate: false, inputs: [] },
        site_id: 'test',
        az_step_deg: 1,
        n: 360,
        observer_heights_m: [2, 10],
        masks: { '2': new Array(360).fill(0), '10': new Array(360).fill(0) },
      },
      ephem: {
        meta: { contract_version: '1.1.1', generated_utc: '', generator: '', synthetic: true, approximate: false, inputs: [] },
        site_id: 'test',
        start_utc: '2027-01-01T00:00:00Z',
        step_minutes: 60,
        count,
        sun: { az: new Array(count).fill(0), el: [-1, 0, -1, -2, -3] },
        earth: { az: new Array(count).fill(0), el: [-1, 0, -1, -2, -3] },
        sun_ang_radius_deg: 0.25,
        earth_ang_radius_deg: 1.0,
      },
    };

    const events = listSkyEvents(bundle, 2, t0, t0 + count * 3_600_000);
    // Phantom simultaneous sunrise and sunset at index 1 must be filtered out
    expect(events).toEqual([]);
  });

  it('detects terminal sample sunset and earthset when clearance reaches 0 at final coverage sample (L4 #2)', () => {
    // 3 samples: clearance [2.0, 1.0, 0.0]
    // Final sample (k=2) reaches exactly 0 from above. Terminal sunset must be recorded.
    const count = 3;
    const t0 = Date.parse('2027-01-01T00:00:00Z');
    const bundle: Pick<SiteBundle, 'horizon' | 'ephem'> = {
      horizon: {
        meta: { contract_version: '1.1.1', generated_utc: '', generator: '', synthetic: true, approximate: false, inputs: [] },
        site_id: 'test',
        az_step_deg: 1,
        n: 360,
        observer_heights_m: [2, 10],
        masks: { '2': new Array(360).fill(0), '10': new Array(360).fill(0) },
      },
      ephem: {
        meta: { contract_version: '1.1.1', generated_utc: '', generator: '', synthetic: true, approximate: false, inputs: [] },
        site_id: 'test',
        start_utc: '2027-01-01T00:00:00Z',
        step_minutes: 60,
        count,
        sun: { az: [0, 0, 0], el: [2, 1, 0] },
        earth: { az: [0, 0, 0], el: [2, 1, 0] },
        sun_ang_radius_deg: 0.25,
        earth_ang_radius_deg: 1.0,
      },
    };

    const events = listSkyEvents(bundle, 2, t0, t0 + count * 3_600_000);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.kind)).toEqual(['earthset', 'sunset']);
    expect(events[0].ms).toBe(t0 + 2 * 3_600_000);
    expect(events[1].ms).toBe(t0 + 2 * 3_600_000);
  });

  it('handles malformed or truncated ephemeris bundle gracefully without throwing (L4 #6)', () => {
    const t0 = Date.parse('2027-01-01T00:00:00Z');
    const malformedBundle = {
      horizon: {
        meta: { contract_version: '1.1.1', generated_utc: '', generator: '', synthetic: true, approximate: false, inputs: [] },
        site_id: 'test',
        az_step_deg: 1,
        n: 360,
        observer_heights_m: [2, 10],
        masks: { '2': new Array(360).fill(0) },
      },
      ephem: {
        meta: { contract_version: '1.1.1', generated_utc: '', generator: '', synthetic: true, approximate: false, inputs: [] },
        site_id: 'test',
        start_utc: '2027-01-01T00:00:00Z',
        step_minutes: 60,
        count: 10,
        sun: { az: [0], el: [0] }, // truncated
        earth: { az: [0], el: [0] },
        sun_ang_radius_deg: 0.25,
        earth_ang_radius_deg: 1.0,
      },
    } as unknown as Pick<SiteBundle, 'horizon' | 'ephem'>;

    expect(() => listSkyEvents(malformedBundle, 2, t0, t0 + 10 * 3_600_000)).not.toThrow();
    expect(listSkyEvents(malformedBundle, 2, t0, t0 + 10 * 3_600_000)).toEqual([]);

    expect(() => longestStretches(malformedBundle, 2, t0, t0 + 10 * 3_600_000)).not.toThrow();
    expect(longestStretches(malformedBundle, 2, t0, t0 + 10 * 3_600_000)).toEqual([]);
  });
});
