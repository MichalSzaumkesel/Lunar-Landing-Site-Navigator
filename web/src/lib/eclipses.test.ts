import { describe, expect, it } from 'vitest';
import type { EphemFile } from './types';
import { discOverlapFraction, listEclipses } from './eclipses';

const H_MS = 3_600_000;
const T0_UTC = '2027-01-01T00:00:00Z';
const T0_MS = Date.parse(T0_UTC);

function buildTestEphem(
  sunAz: number[],
  sunEl: number[],
  earthAz: number[],
  earthEl: number[],
  sunRadius = 0.25,
  earthRadius = 1.0,
): EphemFile {
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
    start_utc: T0_UTC,
    step_minutes: 60,
    count: sunAz.length,
    sun: { az: sunAz, el: sunEl },
    earth: { az: earthAz, el: earthEl },
    sun_ang_radius_deg: sunRadius,
    earth_ang_radius_deg: earthRadius,
  };
}

describe('discOverlapFraction', () => {
  it('returns 0 when circles are separated or touch at the boundary', () => {
    expect(discOverlapFraction(0.25, 1.0, 1.25)).toBe(0);
    expect(discOverlapFraction(0.25, 1.0, 2.0)).toBe(0);
  });

  it('returns 1 when smaller circle (Sun) is fully within larger circle (Earth)', () => {
    // rEarth = 1.0, rSun = 0.25, rEarth - rSun = 0.75
    expect(discOverlapFraction(0.25, 1.0, 0.75)).toBe(1);
    expect(discOverlapFraction(0.25, 1.0, 0.0)).toBe(1);
  });

  it('computes exact circular intersection fraction for symmetric overlapping discs', () => {
    // Hand calculation: rSun = 1.0, rEarth = 1.0, d = 1.0
    // cos(alpha) = (1^2 + 1^2 - 1^2) / (2 * 1 * 1) = 0.5 -> alpha = pi / 3
    // Area of each circular segment: 1^2 * (pi/3) - 0.5 * sin(2pi/3) = pi/3 - sqrt(3)/4
    // Total intersection area: 2 * (pi/3 - sqrt(3)/4) = 2pi/3 - sqrt(3)/2 ~= 1.2283697
    // Sun disc area: pi * 1^2 = pi
    // Overlap fraction: (2pi/3 - sqrt(3)/2) / pi = 2/3 - sqrt(3)/(2pi) ~= 0.3910022
    const expected = 2 / 3 - Math.sqrt(3) / (2 * Math.PI);
    expect(discOverlapFraction(1.0, 1.0, 1.0)).toBeCloseTo(expected, 6);
  });
});

describe('listEclipses', () => {
  it('returns empty array when there is no overlap', () => {
    const count = 10;
    const sunAz = new Array(count).fill(0);
    const sunEl = new Array(count).fill(0);
    const earthAz = new Array(count).fill(10);
    const earthEl = new Array(count).fill(0);

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl);
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + count * H_MS);
    expect(eclipses).toEqual([]);
  });

  it('detects one eclipse spanning 5 samples with linearly interpolated contact times', () => {
    // 10 samples: indices 0..1 separated by 10 deg, indices 2..6 separated by 0.5 deg (< 1.25), indices 7..9 separated by 10 deg
    // Hand calculation:
    // rSun = 0.25, rEarth = 1.0 -> rSum = 1.25
    // Ingress between k=1 (sep=10) and k=2 (sep=0.5):
    //   frac = (10 - 1.25) / (10 - 0.5) = 8.75 / 9.5 = 35 / 38 ~= 0.9210526
    //   tStart = T0 + 1h + (35/38)*1h = T0 + 3600000 + round(3315789.47) = T0 + 6915789 ms
    // Egress between k=6 (sep=0.5) and k=7 (sep=10):
    //   frac = (1.25 - 0.5) / (10 - 0.5) = 0.75 / 9.5 = 3 / 38 ~= 0.0789474
    //   tEnd = T0 + 6h + (3/38)*1h = T0 + 21600000 + round(284210.53) = T0 + 21884211 ms
    // At sep = 0.5 <= rEarth - rSun (0.75), Sun is fully inside Earth disc -> maxOverlapFraction = 1
    const count = 10;
    const sunAz = new Array(count).fill(0);
    const sunEl = new Array(count).fill(0);
    const earthAz = [10, 10, 0.5, 0.5, 0.5, 0.5, 0.5, 10, 10, 10];
    const earthEl = new Array(count).fill(0);

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0);
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + count * H_MS);

    expect(eclipses).toHaveLength(1);
    const [e] = eclipses;
    expect(e.startMs).toBe(T0_MS + 6915789);
    expect(e.endMs).toBe(T0_MS + 21884211);
    expect(e.maxOverlapFraction).toBe(1);
    expect(e.minSeparationDeg).toBeCloseTo(0.5, 4);
  });

  it('detects two separate eclipses with linearly interpolated contact boundaries', () => {
    // Hand calculation:
    // rSum = 1.25.
    // Eclipse 1 (samples 1..2 at sep=1.1):
    //   Ingress: k=0 (10) to k=1 (1.1) -> frac = (10 - 1.25)/(10 - 1.1) = 8.75/8.9 = 175/178 ~= 0.983146
    //   tStart1 = T0 + round(3600000 * 175/178) = T0 + 3539326 ms
    //   Egress: k=2 (1.1) to k=3 (10) -> frac = (1.25 - 1.1)/(10 - 1.1) = 0.15/8.9 = 3/178 ~= 0.016854
    //   tEnd1 = T0 + 2*3600000 + round(3600000 * 3/178) = T0 + 7200000 + 60674 = T0 + 7260674 ms
    // Eclipse 2 (samples 4..5 at sep=1.0):
    //   Ingress: k=3 (10) to k=4 (1.0) -> frac = (10 - 1.25)/(10 - 1.0) = 8.75/9.0 = 35/36 ~= 0.972222
    //   tStart2 = T0 + 3*3600000 + round(3600000 * 35/36) = T0 + 10800000 + 3500000 = T0 + 14300000 ms
    //   Egress: k=5 (1.0) to k=6 (10) -> frac = (1.25 - 1.0)/(10 - 1.0) = 0.25/9.0 = 1/36 ~= 0.027778
    //   tEnd2 = T0 + 5*3600000 + round(3600000 * 1/36) = T0 + 18000000 + 100000 = T0 + 18100000 ms
    const sunAz = [0, 0, 0, 0, 0, 0, 0];
    const sunEl = [0, 0, 0, 0, 0, 0, 0];
    const earthAz = [10, 1.1, 1.1, 10, 1.0, 1.0, 10];
    const earthEl = [0, 0, 0, 0, 0, 0, 0];

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0);
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + 7 * H_MS);

    expect(eclipses).toHaveLength(2);
    expect(eclipses[0].startMs).toBe(T0_MS + 3539326);
    expect(eclipses[0].endMs).toBe(T0_MS + 7260674);
    expect(eclipses[1].startMs).toBe(T0_MS + 14300000);
    expect(eclipses[1].endMs).toBe(T0_MS + 18100000);
  });

  it('cuts an eclipse when the window starts or ends inside it', () => {
    // 6 samples, all overlapping (indices 0..5)
    const count = 6;
    const sunAz = new Array(count).fill(0);
    const sunEl = new Array(count).fill(0);
    const earthAz = new Array(count).fill(0.5);
    const earthEl = new Array(count).fill(0);

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0);

    // Window cuts to indices [2, 5) -> [T0 + 2h, T0 + 5h]
    const eclipses = listEclipses(ephem, T0_MS + 2 * H_MS, T0_MS + 5 * H_MS);
    expect(eclipses).toHaveLength(1);
    expect(eclipses[0].startMs).toBe(T0_MS + 2 * H_MS);
    expect(eclipses[0].endMs).toBe(T0_MS + 5 * H_MS);
  });

  it('calculates total overlap fraction 1 when the Sun is fully inside the Earth disc', () => {
    const ephem = buildTestEphem([0], [0], [0], [0], 0.25, 1.0);
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + 1 * H_MS);

    expect(eclipses).toHaveLength(1);
    expect(eclipses[0].maxOverlapFraction).toBe(1);
    expect(eclipses[0].minSeparationDeg).toBe(0);
  });

  it('calculates partial overlap fraction correctly via closed-form 2D disc overlap', () => {
    // Hand calculation:
    // rSun = 0.5, rEarth = 1.0, sep = 1.2
    // cos(alpha) = (0.5^2 + 1.2^2 - 1.0^2) / (2 * 0.5 * 1.2) = 0.69 / 1.2 = 0.575
    // alpha = arccos(0.575) ~= 0.9581922 rad
    // Area 1 = 0.5^2 * alpha - 0.5 * 0.5^2 * sin(2 * alpha) ~= 0.1219985
    // cos(beta) = (1.0^2 + 1.2^2 - 0.5^2) / (2 * 1.0 * 1.2) = 2.19 / 2.4 = 0.9125
    // beta = arccos(0.9125) ~= 0.4214420 rad
    // Area 2 = 1.0^2 * beta - 0.5 * 1.0^2 * sin(2 * beta) ~= 0.0480995
    // Total overlap area = Area 1 + Area 2 ~= 0.1700980
    // Sun disc area = pi * 0.5^2 ~= 0.7853982
    // Overlap fraction = 0.1700980 / 0.7853982 ~= 0.2165755 (21.66%)
    const ephem = buildTestEphem([0], [0], [1.2], [0], 0.5, 1.0);
    const eclipses = listEclipses(ephem, T0_MS, T0_MS + 1 * H_MS);

    expect(eclipses).toHaveLength(1);
    expect(eclipses[0].maxOverlapFraction).toBeCloseTo(0.2165755, 4);
  });

  it('clamps endMs to the query endMs when an eclipse continues past the query range', () => {
    const count = 10;
    const sunAz = new Array(count).fill(0);
    const sunEl = new Array(count).fill(0);
    const earthAz = new Array(count).fill(0.5);
    const earthEl = new Array(count).fill(0);

    const ephem = buildTestEphem(sunAz, sunEl, earthAz, earthEl, 0.25, 1.0);

    const queryEndMs = T0_MS + Math.floor(3.5 * H_MS);
    const eclipses = listEclipses(ephem, T0_MS, queryEndMs);

    expect(eclipses).toHaveLength(1);
    expect(eclipses[0].startMs).toBe(T0_MS);
    expect(eclipses[0].endMs).toBe(queryEndMs);
  });
});
