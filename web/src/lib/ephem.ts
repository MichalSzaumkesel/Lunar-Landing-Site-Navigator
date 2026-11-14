import type { EphemFile } from './types.ts';
import { normalizeAz } from './horizon.ts';

export interface SkyPosition {
  az: number;
  el: number;
}

export interface SkySample {
  sun: SkyPosition;
  earth: SkyPosition;
}

export function ephemCoverage(
  e: Pick<EphemFile, 'start_utc' | 'step_minutes' | 'count'>,
): { startMs: number; endMs: number } {
  const startMs = Date.parse(e.start_utc);
  const stepMs = e.step_minutes * 60_000;
  const lastIndex = Math.max(0, e.count - 1);
  const endMs = startMs + lastIndex * stepMs;
  return { startMs, endMs };
}

function interpolateAz(az0: number, az1: number, frac: number): number {
  const a0 = normalizeAz(az0);
  const a1 = normalizeAz(az1);
  let diff = (a1 - a0) % 360;
  if (diff < -180) {
    diff += 360;
  } else if (diff > 180) {
    diff -= 360;
  }
  return normalizeAz(a0 + frac * diff);
}

export function sampleAt(e: EphemFile, ms: number): SkySample | null {
  if (e.count <= 0) {
    return null;
  }

  const { startMs, endMs } = ephemCoverage(e);
  if (Number.isNaN(ms) || ms < startMs || ms > endMs) {
    return null;
  }

  if (e.count === 1 || startMs === endMs) {
    return {
      sun: { az: normalizeAz(e.sun.az[0]), el: e.sun.el[0] },
      earth: { az: normalizeAz(e.earth.az[0]), el: e.earth.el[0] },
    };
  }

  const stepMs = e.step_minutes * 60_000;
  if (stepMs <= 0) {
    return {
      sun: { az: normalizeAz(e.sun.az[0]), el: e.sun.el[0] },
      earth: { az: normalizeAz(e.earth.az[0]), el: e.earth.el[0] },
    };
  }

  const kFloat = (ms - startMs) / stepMs;
  let k0 = Math.floor(kFloat);
  let frac = kFloat - k0;
  if (k0 >= e.count - 1) {
    k0 = e.count - 1;
    frac = 0;
  }
  const k1 = k0 >= e.count - 1 ? k0 : k0 + 1;

  const sunAz = interpolateAz(e.sun.az[k0], e.sun.az[k1], frac);
  const sunEl = e.sun.el[k0] + frac * (e.sun.el[k1] - e.sun.el[k0]);

  const earthAz = interpolateAz(e.earth.az[k0], e.earth.az[k1], frac);
  const earthEl = e.earth.el[k0] + frac * (e.earth.el[k1] - e.earth.el[k0]);

  return {
    sun: { az: sunAz, el: sunEl },
    earth: { az: earthAz, el: earthEl },
  };
}
