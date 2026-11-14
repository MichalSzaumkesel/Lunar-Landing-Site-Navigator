import { angularSeparationDeg } from './earthPhase';
import type { EphemFile } from './types';

export interface Eclipse {
  startMs: number;
  endMs: number;
  maxOverlapFraction: number;
  minSeparationDeg: number;
}

/**
 * Closed-form 2D circle-circle intersection area fraction (L2 #4).
 * Returns the fraction of the Sun disc (radius rSun) obscured by the Earth disc (radius rEarth)
 * at center-to-center angular separation d (in degrees).
 */
export function discOverlapFraction(rSun: number, rEarth: number, d: number): number {
  if (rSun <= 0 || rEarth <= 0 || d >= rSun + rEarth) {
    return 0;
  }
  if (d <= Math.abs(rEarth - rSun)) {
    // Complete occultation
    if (rEarth >= rSun) return 1;
    // Smaller Earth completely inside larger Sun
    return (rEarth * rEarth) / (rSun * rSun);
  }

  const rSun2 = rSun * rSun;
  const rEarth2 = rEarth * rEarth;
  const d2 = d * d;

  const cosAlpha = Math.max(-1, Math.min(1, (rSun2 + d2 - rEarth2) / (2 * rSun * d)));
  const cosBeta = Math.max(-1, Math.min(1, (rEarth2 + d2 - rSun2) / (2 * rEarth * d)));
  const alpha = Math.acos(cosAlpha);
  const beta = Math.acos(cosBeta);

  const area =
    rSun2 * alpha -
    (rSun2 * Math.sin(2 * alpha)) / 2 +
    rEarth2 * beta -
    (rEarth2 * Math.sin(2 * beta)) / 2;

  return Math.max(0, Math.min(1, area / (Math.PI * rSun2)));
}

/**
 * Geometric overlap of the Earth and Sun discs seen from a lunar site.
 * Linearly interpolates ingress and egress contact times between samples (L2 #5).
 *
 * Note: Terrain obstruction is ignored on purpose; eclipses represent geometric overlap
 * of the Sun and Earth discs as seen from the site coordinates regardless of whether the
 * bodies are above or below the local horizon.
 */
export function listEclipses(
  ephem: EphemFile,
  startMs: number,
  endMs: number,
): Eclipse[] {
  if (ephem.count <= 0 || startMs >= endMs) {
    return [];
  }

  const ephemStartMs = Date.parse(ephem.start_utc);
  const stepMs = ephem.step_minutes * 60_000;
  if (stepMs <= 0 || !Number.isFinite(ephemStartMs)) {
    return [];
  }

  if (
    !ephem.sun ||
    !ephem.earth ||
    ephem.sun.az.length < ephem.count ||
    ephem.sun.el.length < ephem.count ||
    ephem.earth.az.length < ephem.count ||
    ephem.earth.el.length < ephem.count
  ) {
    return [];
  }

  const rSun = ephem.sun_ang_radius_deg;
  const rEarth = ephem.earth_ang_radius_deg;
  if (
    typeof rSun !== 'number' ||
    typeof rEarth !== 'number' ||
    !Number.isFinite(rSun) ||
    !Number.isFinite(rEarth) ||
    rSun <= 0 ||
    rEarth <= 0
  ) {
    return [];
  }
  const rSum = rSun + rEarth;

  // Precompute separations for all ephemeris samples
  const seps = new Float64Array(ephem.count);
  for (let k = 0; k < ephem.count; k++) {
    seps[k] = angularSeparationDeg(
      { az: ephem.sun.az[k], el: ephem.sun.el[k] },
      { az: ephem.earth.az[k], el: ephem.earth.el[k] },
    );
  }

  const eclipses: Eclipse[] = [];
  let inRun = false;
  let runStartK = -1;
  let runEndK = -1;
  let curMaxOverlap = 0;
  let curMinSeparation = Infinity;

  const flushRun = () => {
    if (!inRun || runStartK < 0) return;

    const tkStart = ephemStartMs + runStartK * stepMs;
    const tkEnd = ephemStartMs + runEndK * stepMs;

    // Ingress contact interpolation between runStartK - 1 and runStartK
    let tStart = tkStart;
    if (runStartK > 0 && seps[runStartK - 1] >= rSum && seps[runStartK - 1] > seps[runStartK]) {
      const frac = (seps[runStartK - 1] - rSum) / (seps[runStartK - 1] - seps[runStartK]);
      tStart = ephemStartMs + (runStartK - 1 + frac) * stepMs;
    }

    // Egress contact interpolation between runEndK and runEndK + 1
    let tEnd = tkEnd + stepMs;
    if (runEndK < ephem.count - 1 && seps[runEndK + 1] >= rSum && seps[runEndK + 1] > seps[runEndK]) {
      const frac = (rSum - seps[runEndK]) / (seps[runEndK + 1] - seps[runEndK]);
      tEnd = tkEnd + frac * stepMs;
    }

    const clampedStart = Math.max(startMs, Math.round(tStart));
    const clampedEnd = Math.min(endMs, Math.round(tEnd));

    if (clampedStart < clampedEnd) {
      eclipses.push({
        startMs: clampedStart,
        endMs: clampedEnd,
        maxOverlapFraction: curMaxOverlap,
        minSeparationDeg: curMinSeparation,
      });
    }

    inRun = false;
    runStartK = -1;
    runEndK = -1;
    curMaxOverlap = 0;
    curMinSeparation = Infinity;
  };

  for (let k = 0; k < ephem.count; k++) {
    const sep = seps[k];
    if (sep < rSum) {
      const frac = discOverlapFraction(rSun, rEarth, sep);
      if (!inRun) {
        inRun = true;
        runStartK = k;
        runEndK = k;
        curMaxOverlap = frac;
        curMinSeparation = sep;
      } else {
        runEndK = k;
        if (frac > curMaxOverlap) curMaxOverlap = frac;
        if (sep < curMinSeparation) curMinSeparation = sep;
      }
    } else if (inRun) {
      flushRun();
    }
  }

  if (inRun) {
    flushRun();
  }

  return eclipses;
}
