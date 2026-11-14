import type {
  HorizonFile,
  ObserverHeightM,
  ScenarioMetrics,
  SiteBundle,
} from './types.ts';
import { horizonAt } from './horizon.ts';
import { ephemCoverage, sampleAt } from './ephem.ts';

/**
 * Selects the horizon mask for the given observer height.
 * Falls back to mask '2', then to the first available mask, then to a flat 0 mask ([]).
 */
export function pickMaskFor(
  horizon: Pick<HorizonFile, 'masks'> | null | undefined,
  observerHeightM: number,
): readonly number[] {
  if (!horizon || !horizon.masks) return [];
  const key = String(observerHeightM);
  return (
    horizon.masks[key] ??
    horizon.masks['2'] ??
    Object.values(horizon.masks)[0] ??
    []
  );
}

export function bodyFraction(clearDeg: number, radiusDeg: number): number {
  if (radiusDeg <= 0) {
    return clearDeg >= 0 ? 1 : 0;
  }
  const x = Math.max(-1, Math.min(1, clearDeg / radiusDeg));
  const frac = 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI;
  return Math.max(0, Math.min(1, frac));
}

export interface MetricsInput {
  observerHeightM: ObserverHeightM;
  startMs: number;
  endMs: number;
  refMs?: number;
}

function formatIsoUtc(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const roundedSecMs = Math.round(ms / 1000) * 1000;
  try {
    return new Date(roundedSecMs).toISOString().slice(0, 19) + 'Z';
  } catch {
    return '';
  }
}

export function computeMetrics(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  input: MetricsInput,
): ScenarioMetrics | null {
  const { ephem, horizon } = bundle;
  if (ephem.count <= 0 || input.startMs >= input.endMs) {
    return null;
  }

  const { startMs: startMsCov, endMs: endMsCov } = ephemCoverage(ephem);
  const stepMs = ephem.step_minutes * 60_000;
  if (stepMs <= 0) {
    return null;
  }

  // Find range of qualifying sample indices: t_k in [startMs, endMs) and in coverage
  let kStart = Math.max(0, Math.floor((input.startMs - startMsCov) / stepMs));
  while (kStart < ephem.count && startMsCov + kStart * stepMs < input.startMs) {
    kStart++;
  }

  let kEnd = Math.min(
    ephem.count,
    Math.ceil((input.endMs - startMsCov) / stepMs) + 1,
  );
  while (kEnd > kStart && startMsCov + (kEnd - 1) * stepMs >= input.endMs) {
    kEnd--;
  }

  const N = kEnd - kStart;
  if (N <= 0) {
    return null;
  }

  const mask = pickMaskFor(horizon, input.observerHeightM);
  const azStepDeg = horizon.az_step_deg;

  const rawRefMs = input.refMs ?? input.startMs;
  const clampedRefMs = Math.max(startMsCov, Math.min(endMsCov, rawRefMs));
  const refSample = sampleAt(ephem, clampedRefMs);
  if (!refSample) {
    return null;
  }

  const sun_el_deg = refSample.sun.el;
  const sunHAtRef = horizonAt(mask, azStepDeg, refSample.sun.az);
  const sun_clearance_deg = sun_el_deg - sunHAtRef;

  const stepH = ephem.step_minutes / 60;
  const sunRadius = ephem.sun_ang_radius_deg;

  let countSunlit = 0;
  let sumSunFrac = 0;
  let currentDarkRun = 0;
  let maxDarkRun = 0;

  let countEarth = 0;
  let currentNoEarthRun = 0;
  let maxNoEarthRun = 0;

  let countBoth = 0;

  for (let k = kStart; k < kEnd; k++) {
    const azSun = ephem.sun.az[k];
    const elSun = ephem.sun.el[k];
    const hSun = horizonAt(mask, azStepDeg, azSun);
    const clearSun = elSun - hSun;
    const fracSun = bodyFraction(clearSun, sunRadius);
    const isSunlit = clearSun >= 0;

    if (isSunlit) {
      countSunlit++;
      currentDarkRun = 0;
    } else {
      currentDarkRun++;
      if (currentDarkRun > maxDarkRun) {
        maxDarkRun = currentDarkRun;
      }
    }
    sumSunFrac += fracSun;

    const azEarth = ephem.earth.az[k];
    const elEarth = ephem.earth.el[k];
    const hEarth = horizonAt(mask, azStepDeg, azEarth);
    const clearEarth = elEarth - hEarth;
    const isEarthInView = clearEarth >= 0;

    if (isEarthInView) {
      countEarth++;
      currentNoEarthRun = 0;
    } else {
      currentNoEarthRun++;
      if (currentNoEarthRun > maxNoEarthRun) {
        maxNoEarthRun = currentNoEarthRun;
      }
    }

    if (isSunlit && isEarthInView) {
      countBoth++;
    }
  }

  const pct_sunlit = (countSunlit / N) * 100;
  const mean_sun_frac = (sumSunFrac / N) * 100;
  const longest_dark_h = maxDarkRun * stepH;
  const pct_earth = (countEarth / N) * 100;
  const longest_no_earth_h = maxNoEarthRun * stepH;
  const pct_both = (countBoth / N) * 100;

  // Transitions from refMs to end of coverage
  let next_sunset_utc: string | null = null;
  let next_sunrise_utc: string | null = null;
  let next_earthset_utc: string | null = null;
  let next_earthrise_utc: string | null = null;

  if (rawRefMs <= endMsCov && ephem.count >= 2) {
    let kTransStart = Math.floor((rawRefMs - startMsCov) / stepMs) - 1;
    if (kTransStart < 0) {
      kTransStart = 0;
    }

    let prevClearSun =
      ephem.sun.el[kTransStart] -
      horizonAt(mask, azStepDeg, ephem.sun.az[kTransStart]);
    let prevClearEarth =
      ephem.earth.el[kTransStart] -
      horizonAt(mask, azStepDeg, ephem.earth.az[kTransStart]);

    for (let k = kTransStart; k < ephem.count - 1; k++) {
      const kNext = k + 1;
      const nextClearSun =
        ephem.sun.el[kNext] -
        horizonAt(mask, azStepDeg, ephem.sun.az[kNext]);
      const nextClearEarth =
        ephem.earth.el[kNext] -
        horizonAt(mask, azStepDeg, ephem.earth.az[kNext]);

      const tk = startMsCov + k * stepMs;

      // Sunset: true -> false
      if (next_sunset_utc === null && prevClearSun >= 0 && nextClearSun < 0) {
        const frac = prevClearSun / (prevClearSun - nextClearSun);
        const t = tk + frac * stepMs;
        if (t >= rawRefMs) {
          next_sunset_utc = formatIsoUtc(t);
        }
      }

      // Sunrise: false -> true
      if (next_sunrise_utc === null && prevClearSun < 0 && nextClearSun >= 0) {
        const frac = prevClearSun / (prevClearSun - nextClearSun);
        const t = tk + frac * stepMs;
        if (t >= rawRefMs) {
          next_sunrise_utc = formatIsoUtc(t);
        }
      }

      // Earthset: true -> false
      if (
        next_earthset_utc === null &&
        prevClearEarth >= 0 &&
        nextClearEarth < 0
      ) {
        const frac = prevClearEarth / (prevClearEarth - nextClearEarth);
        const t = tk + frac * stepMs;
        if (t >= rawRefMs) {
          next_earthset_utc = formatIsoUtc(t);
        }
      }

      // Earthrise: false -> true
      if (
        next_earthrise_utc === null &&
        prevClearEarth < 0 &&
        nextClearEarth >= 0
      ) {
        const frac = prevClearEarth / (prevClearEarth - nextClearEarth);
        const t = tk + frac * stepMs;
        if (t >= rawRefMs) {
          next_earthrise_utc = formatIsoUtc(t);
        }
      }

      if (
        next_sunset_utc !== null &&
        next_sunrise_utc !== null &&
        next_earthset_utc !== null &&
        next_earthrise_utc !== null
      ) {
        break;
      }

      prevClearSun = nextClearSun;
      prevClearEarth = nextClearEarth;
    }
  }

  const normZero = (v: number) => (Object.is(v, -0) ? 0 : v);

  const time_to_sunset_h =
    next_sunset_utc !== null
      ? normZero(Math.max(0, (Date.parse(next_sunset_utc) - clampedRefMs) / 3_600_000))
      : null;

  const time_to_earthset_h =
    next_earthset_utc !== null
      ? normZero(Math.max(0, (Date.parse(next_earthset_utc) - clampedRefMs) / 3_600_000))
      : null;

  const gaps: ScenarioMetrics['gaps'] = {};
  if (next_sunset_utc === null) {
    gaps.sunset = 'beyond_data';
  }
  if (next_sunrise_utc === null) {
    gaps.sunrise = 'beyond_data';
  }
  if (next_earthset_utc === null) {
    gaps.earthset = 'beyond_data';
  }
  if (next_earthrise_utc === null) {
    gaps.earthrise = 'beyond_data';
  }

  return {
    sun_el_deg,
    sun_clearance_deg,
    pct_sunlit,
    mean_sun_frac,
    longest_dark_h,
    pct_earth,
    longest_no_earth_h,
    pct_both,
    next_sunset_utc,
    next_sunrise_utc,
    next_earthset_utc,
    next_earthrise_utc,
    time_to_sunset_h,
    time_to_earthset_h,
    gaps,
  };
}
