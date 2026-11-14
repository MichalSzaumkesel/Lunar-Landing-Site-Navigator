import type { LandingWindow, MissionRules, SiteBundle } from './types';
import { horizonAt } from './horizon';
import { ephemCoverage } from './ephem';
import { pickMaskFor } from './metrics';

export interface FinderRange {
  startMs: number;
  endMs: number;
}

export interface MissionRuleEvaluation {
  valid: boolean;
  failingRule: string | null;
  pctSunlit?: number;
  longestDarkH?: number;
  pctEarth?: number;
  earthAtLanding?: boolean;
  sunElAtLanding?: number;
}

function formatIsoUtc(ms: number): string {
  const roundedSecMs = Math.round(ms / 1000) * 1000;
  return new Date(roundedSecMs).toISOString().slice(0, 19) + 'Z';
}

/**
 * Evaluates mission rules for a candidate landing start time on a site bundle.
 * Shared rule evaluation used by findWindows, windowMap, and missionBar.
 */
export function evaluateMissionRulesAt(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  rules: MissionRules,
  landingMs: number,
): MissionRuleEvaluation {
  const { ephem, horizon } = bundle;
  const count = ephem?.count ?? 0;
  if (count <= 0) {
    return { valid: false, failingRule: 'Outside data range' };
  }

  if (rules.missionDurationH <= 0) {
    return { valid: false, failingRule: 'Invalid mission duration' };
  }

  const stepMinutes = ephem.step_minutes ?? 0;
  if (stepMinutes <= 0) {
    return { valid: false, failingRule: 'Outside data range' };
  }

  const stepH = stepMinutes / 60;
  const stepMs = stepMinutes * 60_000;
  const n = Math.round(rules.missionDurationH / stepH);
  if (n < 1) {
    return { valid: false, failingRule: 'Invalid mission duration' };
  }

  if (
    !ephem.sun ||
    !ephem.earth ||
    ephem.sun.az.length < count ||
    ephem.sun.el.length < count ||
    ephem.earth.az.length < count ||
    ephem.earth.el.length < count
  ) {
    return { valid: false, failingRule: 'Outside data range' };
  }

  const { startMs: covStartMs, endMs: covEndMs } = ephemCoverage(ephem);
  if (!Number.isFinite(covStartMs) || !Number.isFinite(covEndMs)) {
    return { valid: false, failingRule: 'Outside data range' };
  }

  const kFloat = (landingMs - covStartMs) / stepMs;
  const k = Math.round(kFloat);
  if (k < 0 || k + n > count) {
    return { valid: false, failingRule: 'Outside data range' };
  }

  const mask = pickMaskFor(horizon, rules.observerHeightM);
  const azStepDeg = horizon?.az_step_deg ?? 0;

  // 1. Earth at landing required
  const hEarthLanding = horizonAt(mask, azStepDeg, ephem.earth.az[k]);
  const earthAtLanding = ephem.earth.el[k] - hEarthLanding >= 0;
  if (rules.earthAtLandingRequired && !earthAtLanding) {
    return {
      valid: false,
      failingRule: 'Earth at landing',
      earthAtLanding: false,
    };
  }

  // 2. Minimum Sun elevation above local terrain horizon at landing (clearance)
  const hSunLanding = horizonAt(mask, azStepDeg, ephem.sun.az[k]);
  const sunClearanceLanding = ephem.sun.el[k] - hSunLanding;
  if (
    rules.minSunElAtLandingDeg !== undefined &&
    sunClearanceLanding < rules.minSunElAtLandingDeg
  ) {
    return {
      valid: false,
      failingRule: 'Sun elevation at landing',
      earthAtLanding,
      sunElAtLanding: sunClearanceLanding,
    };
  }

  // 3. Interval metrics evaluation over samples [k .. k + n - 1]
  let countSunlit = 0;
  let countEarth = 0;
  let currentDarkRun = 0;
  let maxDarkRun = 0;

  for (let j = 0; j < n; j++) {
    const idx = k + j;
    const hSun = horizonAt(mask, azStepDeg, ephem.sun.az[idx]);
    const isSunlit = ephem.sun.el[idx] - hSun >= 0;
    if (isSunlit) {
      countSunlit++;
      currentDarkRun = 0;
    } else {
      currentDarkRun++;
      if (currentDarkRun > maxDarkRun) {
        maxDarkRun = currentDarkRun;
      }
    }

    const hEarth = horizonAt(mask, azStepDeg, ephem.earth.az[idx]);
    if (ephem.earth.el[idx] - hEarth >= 0) {
      countEarth++;
    }
  }

  const pctSunlit = (countSunlit / n) * 100;
  const pctEarth = (countEarth / n) * 100;
  const longestDarkH = maxDarkRun * stepH;

  if (pctSunlit < rules.minPctSunlit) {
    return {
      valid: false,
      failingRule: 'Min % Sun visible',
      pctSunlit,
      longestDarkH,
      pctEarth,
      earthAtLanding,
      sunElAtLanding: sunClearanceLanding,
    };
  }

  if (longestDarkH > rules.maxLongestDarkH) {
    return {
      valid: false,
      failingRule: 'Max dark stretch',
      pctSunlit,
      longestDarkH,
      pctEarth,
      earthAtLanding,
      sunElAtLanding: sunClearanceLanding,
    };
  }

  if (pctEarth < rules.minPctEarth) {
    return {
      valid: false,
      failingRule: 'Min % Earth in view',
      pctSunlit,
      longestDarkH,
      pctEarth,
      earthAtLanding,
      sunElAtLanding: sunClearanceLanding,
    };
  }

  return {
    valid: true,
    failingRule: null,
    pctSunlit,
    longestDarkH,
    pctEarth,
    earthAtLanding,
    sunElAtLanding: sunClearanceLanding,
  };
}

export function findWindows(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  rules: MissionRules,
  range?: FinderRange,
): LandingWindow[] {
  const { ephem } = bundle;
  const count = ephem?.count ?? 0;
  if (count <= 0 || rules.missionDurationH <= 0) {
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

  const windows: LandingWindow[] = [];
  let runStartK = -1;
  let runEndK = -1;

  for (let k = k0; k <= k1; k++) {
    if (k + n > count) {
      break;
    }

    const landingMs = covStartMs + k * stepMs;
    const evalRes = evaluateMissionRulesAt(bundle, rules, landingMs);

    if (evalRes.valid) {
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
