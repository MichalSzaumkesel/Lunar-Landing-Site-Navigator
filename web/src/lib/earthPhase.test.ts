import { describe, expect, it } from 'vitest';
import {
  angularSeparationDeg,
  brightLimbDirection,
  earthIlluminatedFraction,
  earthPhaseName,
} from './earthPhase.ts';

describe('angularSeparationDeg', () => {
  it('returns 0 for identical directions', () => {
    expect(
      angularSeparationDeg({ az: 45, el: 30 }, { az: 45, el: 30 }),
    ).toBeCloseTo(0, 8);
    expect(
      angularSeparationDeg({ az: 0, el: 90 }, { az: 180, el: 90 }),
    ).toBeCloseTo(0, 8);
  });

  it('returns 180 for opposite directions', () => {
    expect(
      angularSeparationDeg({ az: 0, el: 0 }, { az: 180, el: 0 }),
    ).toBeCloseTo(180, 8);
    expect(
      angularSeparationDeg({ az: 90, el: 0 }, { az: 270, el: 0 }),
    ).toBeCloseTo(180, 8);
    expect(
      angularSeparationDeg({ az: 0, el: 90 }, { az: 0, el: -90 }),
    ).toBeCloseTo(180, 8);
  });

  it('returns 90 for orthogonal directions', () => {
    expect(
      angularSeparationDeg({ az: 0, el: 0 }, { az: 90, el: 0 }),
    ).toBeCloseTo(90, 8);
    expect(
      angularSeparationDeg({ az: 0, el: 90 }, { az: 0, el: 0 }),
    ).toBeCloseTo(90, 8);
  });
});

describe('earthIlluminatedFraction', () => {
  it('returns 1 for opposite directions (full Earth)', () => {
    const sun = { az: 0, el: 0 };
    const earth = { az: 180, el: 0 };
    expect(earthIlluminatedFraction(sun, earth)).toBeCloseTo(1, 8);
  });

  it('returns 0 for identical directions (new Earth)', () => {
    const sun = { az: 45, el: 20 };
    const earth = { az: 45, el: 20 };
    expect(earthIlluminatedFraction(sun, earth)).toBeCloseTo(0, 8);
  });

  it('returns 0.5 for directions 90 degrees apart (half Earth)', () => {
    const sun = { az: 90, el: 0 };
    const earth = { az: 0, el: 0 };
    expect(earthIlluminatedFraction(sun, earth)).toBeCloseTo(0.5, 8);

    const sunZenith = { az: 0, el: 90 };
    const earthHorizon = { az: 180, el: 0 };
    expect(earthIlluminatedFraction(sunZenith, earthHorizon)).toBeCloseTo(
      0.5,
      8,
    );
  });
});

describe('earthPhaseName', () => {
  it('categorizes correctly according to boundary thresholds', () => {
    // < 0.05 new
    expect(earthPhaseName(0)).toBe('new');
    expect(earthPhaseName(0.049)).toBe('new');

    // < 0.45 crescent
    expect(earthPhaseName(0.05)).toBe('crescent');
    expect(earthPhaseName(0.449)).toBe('crescent');

    // <= 0.55 half
    expect(earthPhaseName(0.45)).toBe('half');
    expect(earthPhaseName(0.5)).toBe('half');
    expect(earthPhaseName(0.55)).toBe('half');

    // < 0.95 gibbous
    expect(earthPhaseName(0.5501)).toBe('gibbous');
    expect(earthPhaseName(0.949)).toBe('gibbous');

    // otherwise full
    expect(earthPhaseName(0.95)).toBe('full');
    expect(earthPhaseName(1.0)).toBe('full');
  });
});

describe('brightLimbDirection', () => {
  it('returns (1, 0, 0) for Earth at zenith and Sun on eastern horizon', () => {
    const earth = { az: 0, el: 90 };
    const sun = { az: 90, el: 0 };
    const limb = brightLimbDirection(earth, sun);
    expect(limb[0]).toBeCloseTo(1, 8);
    expect(limb[1]).toBeCloseTo(0, 8);
    expect(limb[2]).toBeCloseTo(0, 8);
  });

  it('returns (0, 1, 0) for Earth at zenith and Sun on northern horizon', () => {
    const earth = { az: 0, el: 90 };
    const sun = { az: 0, el: 0 };
    const limb = brightLimbDirection(earth, sun);
    expect(limb[0]).toBeCloseTo(0, 8);
    expect(limb[1]).toBeCloseTo(1, 8);
    expect(limb[2]).toBeCloseTo(0, 8);
  });

  it('returns (0, 0, 1) for Earth on horizon and Sun at zenith', () => {
    const earth = { az: 90, el: 0 };
    const sun = { az: 0, el: 90 };
    const limb = brightLimbDirection(earth, sun);
    expect(limb[0]).toBeCloseTo(0, 8);
    expect(limb[1]).toBeCloseTo(0, 8);
    expect(limb[2]).toBeCloseTo(1, 8);
  });

  it('returns [0, 0, 0] for degenerate collinear inputs', () => {
    // Identical
    expect(
      brightLimbDirection({ az: 45, el: 30 }, { az: 45, el: 30 }),
    ).toEqual([0, 0, 0]);
    // Opposite (antiparallel)
    expect(
      brightLimbDirection({ az: 0, el: 90 }, { az: 0, el: -90 }),
    ).toEqual([0, 0, 0]);
    expect(
      brightLimbDirection({ az: 90, el: 0 }, { az: 270, el: 0 }),
    ).toEqual([0, 0, 0]);
  });
});
