import type { LandingWindow, MissionRules, SiteBundle } from './types';
import { horizonAt } from './horizon';
import { ephemCoverage } from './ephem';
import { pickMaskFor } from './metrics';

export interface FinderRange {
  startMs: number;
  endMs: number;
}

function formatIsoUtc(ms: number): string {
  const roundedSecMs = Math.round(ms / 1000) * 1000;
  return new Date(roundedSecMs).toISOString().slice(0, 19) + 'Z';
}

export function findWindows(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  rules: MissionRules,
  range?: FinderRange,
): LandingWindow[] {
  const { ephem, horizon } = bundle;
  const count = ephem?.count ?? 0;
  if (count <= 0) {
    return [];
  }

  if (rules.missionDurationH <= 0) {
    return [];
  }

  const stepMinutes = ephem.step_minutes;
  if (stepMinutes <= 0) {
    return [];
  }

  const stepH = stepMinutes / 60;
  const n = Math.round(rules.missionDurationH / stepH);
  if (n < 1) {
    return [];
  }

  if (
    !ephem.sun ||
    !ephem.earth ||
    ephem.sun.az.length < count ||
    ephem.sun.el.length < count ||
    ephem.earth.az.length < count ||
    ephem.earth.el.length < count
  ) {
    return [];
  }

  const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(ephem);
  if (!Number.isFinite(covStartMs) || !Number.isFinite(covEndMs)) {
    return [];
  }

  const stepMs = stepMinutes * 60_000;

  let targetStartMs = covStartMs;
  let targetEndMs = covEndMs;

  if (range !== undefined) {
    if (range.startMs > range.endMs) {
      return [];
    }
    if (range.startMs > covEndMs || range.endMs < covStartMs) {
      return [];
    }
    targetStartMs = range.startMs;
    targetEndMs = range.endMs;
  }

  let k0 = Math.ceil((targetStartMs - covStartMs) / stepMs);
  if (k0 > 0 && covStartMs + k0 * stepMs > targetStartMs) {
    if (covStartMs + (k0 - 1) * stepMs >= targetStartMs) {
      k0--;
    }
  } else if (covStartMs + k0 * stepMs < targetStartMs) {
    k0++;
  }

  let k1 = Math.floor((targetEndMs - covStartMs) / stepMs);
  if (k1 < count - 1 && covStartMs + k1 * stepMs < targetEndMs) {
    if (covStartMs + (k1 + 1) * stepMs <= targetEndMs) {
      k1++;
    }
  } else if (covStartMs + k1 * stepMs > targetEndMs) {
    k1--;
  }

  k0 = Math.max(0, k0);
  k1 = Math.min(count - 1, k1);

  if (k0 > k1) {
    return [];
  }

  const mask = pickMaskFor(horizon, rules.observerHeightM);
  const azStepDeg = horizon.az_step_deg ?? 0;

  const sunlit = new Uint8Array(count);
  const earth = new Uint8Array(count);

  for (let k = 0; k < count; k++) {
    const hSun = horizonAt(mask, azStepDeg, ephem.sun.az[k]);
    sunlit[k] = ephem.sun.el[k] - hSun >= 0 ? 1 : 0;

    const hEarth = horizonAt(mask, azStepDeg, ephem.earth.az[k]);
    earth[k] = ephem.earth.el[k] - hEarth >= 0 ? 1 : 0;
  }

  const minSunElDefined = rules.minSunElAtLandingDeg !== undefined;
  const minSunEl = rules.minSunElAtLandingDeg ?? 0;
  const earthAtLandingRequired = rules.earthAtLandingRequired;
  const minPctSunlit = rules.minPctSunlit;
  const maxLongestDarkH = rules.maxLongestDarkH;
  const minPctEarth = rules.minPctEarth;

  const windows: LandingWindow[] = [];
  let runStartK = -1;
  let runEndK = -1;

  for (let k = k0; k <= k1; k++) {
    // Condition 1: whole interval lies inside data coverage
    if (k + n - 1 > count - 1) {
      break;
    }

    // Condition 5: earthAtLandingRequired
    if (earthAtLandingRequired && earth[k] === 0) {
      if (runStartK !== -1) {
        windows.push({
          start_utc: formatIsoUtc(covStartMs + runStartK * stepMs),
          end_utc: formatIsoUtc(covStartMs + runEndK * stepMs),
        });
        runStartK = -1;
        runEndK = -1;
      }
      continue;
    }

    // Condition 6: minSunElAtLandingDeg
    if (minSunElDefined && ephem.sun.el[k] < minSunEl) {
      if (runStartK !== -1) {
        windows.push({
          start_utc: formatIsoUtc(covStartMs + runStartK * stepMs),
          end_utc: formatIsoUtc(covStartMs + runEndK * stepMs),
        });
        runStartK = -1;
        runEndK = -1;
      }
      continue;
    }

    // Evaluate interval samples [k .. k + n - 1]
    let countSunlit = 0;
    let countEarth = 0;
    let currentDarkRun = 0;
    let maxDarkRun = 0;

    for (let j = 0; j < n; j++) {
      const idx = k + j;
      const s = sunlit[idx];
      if (s === 1) {
        countSunlit++;
        currentDarkRun = 0;
      } else {
        currentDarkRun++;
        if (currentDarkRun > maxDarkRun) {
          maxDarkRun = currentDarkRun;
        }
      }
      if (earth[idx] === 1) {
        countEarth++;
      }
    }

    const pctSunlit = (countSunlit / n) * 100;
    const pctEarth = (countEarth / n) * 100;
    const longestDarkH = maxDarkRun * stepH;

    const valid =
      pctSunlit >= minPctSunlit &&
      longestDarkH <= maxLongestDarkH &&
      pctEarth >= minPctEarth;

    if (valid) {
      if (runStartK === -1) {
        runStartK = k;
        runEndK = k;
      } else {
        runEndK = k;
      }
    } else {
      if (runStartK !== -1) {
        windows.push({
          start_utc: formatIsoUtc(covStartMs + runStartK * stepMs),
          end_utc: formatIsoUtc(covStartMs + runEndK * stepMs),
        });
        runStartK = -1;
        runEndK = -1;
      }
    }
  }

  if (runStartK !== -1) {
    windows.push({
      start_utc: formatIsoUtc(covStartMs + runStartK * stepMs),
      end_utc: formatIsoUtc(covStartMs + runEndK * stepMs),
    });
  }

  return windows;
}
