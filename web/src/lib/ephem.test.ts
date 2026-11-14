import { describe, expect, it } from 'vitest';
import type { EphemFile } from './types.ts';
import { ephemCoverage, sampleAt } from './ephem.ts';

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
    count: 3,
    sun: {
      az: [350, 359, 1],
      el: [10, 20, 30],
    },
    earth: {
      az: [1, 359, 350],
      el: [5, 6, 7],
    },
    sun_ang_radius_deg: 0.2666,
    earth_ang_radius_deg: 0.95,
    ...overrides,
  };
}

describe('ephemCoverage', () => {
  it('computes startMs and endMs based on start_utc, step_minutes and count', () => {
    const ephem = createMockEphem({
      start_utc: '2026-12-01T00:00:00Z',
      step_minutes: 60,
      count: 24,
    });
    const { startMs, endMs } = ephemCoverage(ephem);
    expect(startMs).toBe(Date.parse('2026-12-01T00:00:00Z'));
    // 23 hours later: 2026-12-01T23:00:00Z
    expect(endMs).toBe(Date.parse('2026-12-01T23:00:00Z'));
  });

  it('handles count = 1 where startMs equals endMs', () => {
    const ephem = createMockEphem({ count: 1 });
    const { startMs, endMs } = ephemCoverage(ephem);
    expect(startMs).toBe(Date.parse('2026-12-01T00:00:00Z'));
    expect(endMs).toBe(startMs);
  });
});

describe('sampleAt', () => {
  const ephem = createMockEphem();
  const startMs = Date.parse(ephem.start_utc);
  const stepMs = ephem.step_minutes * 60_000;
  const endMs = startMs + (ephem.count - 1) * stepMs;

  it('returns null outside coverage', () => {
    expect(sampleAt(ephem, startMs - 1)).toBeNull();
    expect(sampleAt(ephem, endMs + 1)).toBeNull();
  });

  it('returns exact sample at sample timestamps', () => {
    const sample0 = sampleAt(ephem, startMs);
    expect(sample0).not.toBeNull();
    expect(sample0?.sun.az).toBe(350);
    expect(sample0?.sun.el).toBe(10);
    expect(sample0?.earth.az).toBe(1);
    expect(sample0?.earth.el).toBe(5);

    const sample1 = sampleAt(ephem, startMs + stepMs);
    expect(sample1).not.toBeNull();
    expect(sample1?.sun.az).toBe(359);
    expect(sample1?.sun.el).toBe(20);
  });

  it('includes the last sample time', () => {
    const sampleLast = sampleAt(ephem, endMs);
    expect(sampleLast).not.toBeNull();
    expect(sampleLast?.sun.az).toBe(1);
    expect(sampleLast?.sun.el).toBe(30);
    expect(sampleLast?.earth.az).toBe(350);
    expect(sampleLast?.earth.el).toBe(7);
  });

  it('interpolates linearly in time at midpoint between samples', () => {
    // Between sample 0 (startMs) and sample 1 (startMs + stepMs):
    // Sun el: 10 -> 20 => midpoint 15
    // Sun az: 350 -> 359 => midpoint 354.5
    const mid01 = sampleAt(ephem, startMs + 0.5 * stepMs);
    expect(mid01).not.toBeNull();
    expect(mid01?.sun.el).toBeCloseTo(15);
    expect(mid01?.sun.az).toBeCloseTo(354.5);
  });

  it('interpolates azimuth along shortest arc (359 and 1 gives 0)', () => {
    // Between sample 1 (startMs + stepMs, Sun az: 359) and sample 2 (endMs, Sun az: 1)
    // Shortest arc between 359 and 1 is 2 deg passing through 0 (360)
    // Midpoint: (startMs + 1.5 * stepMs)
    const mid12 = sampleAt(ephem, startMs + 1.5 * stepMs);
    expect(mid12).not.toBeNull();
    expect(mid12?.sun.az).toBeCloseTo(0);
    expect(mid12?.sun.el).toBeCloseTo(25);

    // Earth az: sample 1 is 359, sample 2 is 350 -> diff is -9 deg -> midpoint 354.5
    // Between sample 0 (1) and sample 1 (359) -> midpoint is 0
    const mid01 = sampleAt(ephem, startMs + 0.5 * stepMs);
    expect(mid01?.earth.az).toBeCloseTo(0);
  });

  it('returns null when count <= 0', () => {
    const emptyEphem = createMockEphem({
      count: 0,
      sun: { az: [], el: [] },
      earth: { az: [], el: [] },
    });
    expect(sampleAt(emptyEphem, startMs)).toBeNull();
  });
});
