import { describe, expect, it } from 'vitest';
import { horizonAt, normalizeAz } from './horizon.ts';

describe('normalizeAz', () => {
  it('keeps angles in [0, 360) unchanged', () => {
    expect(normalizeAz(0)).toBe(0);
    expect(normalizeAz(45)).toBe(45);
    expect(normalizeAz(180)).toBe(180);
    expect(normalizeAz(359.5)).toBe(359.5);
  });

  it('wraps 360 to 0', () => {
    expect(normalizeAz(360)).toBe(0);
    expect(normalizeAz(720)).toBe(0);
  });

  it('wraps negative angles into [0, 360)', () => {
    expect(normalizeAz(-0.25)).toBe(359.75);
    expect(normalizeAz(-90)).toBe(270);
    expect(normalizeAz(-360)).toBe(0);
    expect(normalizeAz(-720.5)).toBe(359.5);
  });

  it('wraps angles >= 360 into [0, 360)', () => {
    expect(normalizeAz(360.25)).toBe(0.25);
    expect(normalizeAz(450)).toBe(90);
  });
});

describe('horizonAt', () => {
  it('returns exact sample value on exact sample hit', () => {
    const mask = [1.0, 2.5, 3.0, 4.2];
    const azStep = 90; // samples at 0, 90, 180, 270
    expect(horizonAt(mask, azStep, 0)).toBe(1.0);
    expect(horizonAt(mask, azStep, 90)).toBe(2.5);
    expect(horizonAt(mask, azStep, 180)).toBe(3.0);
    expect(horizonAt(mask, azStep, 270)).toBe(4.2);
  });

  it('interpolates linearly at midpoint between two samples', () => {
    const mask = [1.0, 3.0, 5.0, 7.0];
    const azStep = 90;
    expect(horizonAt(mask, azStep, 45)).toBe(2.0);
    expect(horizonAt(mask, azStep, 135)).toBe(4.0);
  });

  it('wraps between the last and first sample', () => {
    // 720 samples (0.5 deg step). Index 0 is 4, index 719 is 2.
    const mask = new Array(720).fill(0);
    mask[0] = 4;
    mask[719] = 2;
    const azStep = 0.5;

    // Azimuth 359.75 is midpoint between index 719 (359.5 deg) and index 0 (360.0 deg = 0.0 deg)
    expect(horizonAt(mask, azStep, 359.75)).toBe(3.0);
  });

  it('handles negative azimuths and azimuths >= 360', () => {
    const mask = new Array(720).fill(0);
    mask[0] = 4;
    mask[1] = 6;
    mask[719] = 2;
    const azStep = 0.5;

    // -0.25 deg wraps to 359.75 deg -> gives 3.0
    expect(horizonAt(mask, azStep, -0.25)).toBe(3.0);

    // 360.25 deg wraps to 0.25 deg -> midpoint between index 0 (4) and index 1 (6) = 5.0
    expect(horizonAt(mask, azStep, 360.25)).toBe(5.0);
  });

  it('handles empty and single element masks gracefully', () => {
    expect(horizonAt([], 0.5, 100)).toBe(0);
    expect(horizonAt([7.5], 0.5, 100)).toBe(7.5);
  });
});
