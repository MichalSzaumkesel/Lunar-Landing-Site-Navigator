import type { ObserverHeightM, SiteBundle } from './types';
import { horizonAt } from './horizon';
import { ephemCoverage } from './ephem';
import { pickMaskFor } from './metrics';

export type SkyEventKind = 'sunset' | 'sunrise' | 'earthset' | 'earthrise';

export interface SkyEvent {
  kind: SkyEventKind;
  ms: number;
  utc: string;
}

export interface SkyStretch {
  kind: 'longest_dark' | 'longest_no_earth';
  startMs: number;
  endMs: number;
  hours: number;
}

function formatIsoUtc(ms: number): string {
  const roundedSecMs = Math.round(ms / 1000) * 1000;
  return new Date(roundedSecMs).toISOString().slice(0, 19) + 'Z';
}

interface RawSkyEvent extends SkyEvent {
  t: number;
}

/**
 * Lists sunset, sunrise, Earthset, and Earthrise events in [startMs, endMs).
 * Event times are linearly interpolated between consecutive hourly samples.
 */
export function listSkyEvents(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): SkyEvent[] {
  const { ephem, horizon } = bundle;
  if (!ephem || !horizon || ephem.count < 2 || startMs >= endMs) {
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

  const { startMs: startMsCov } = ephemCoverage(ephem);
  const stepMs = ephem.step_minutes * 60_000;
  if (stepMs <= 0 || !Number.isFinite(startMsCov)) {
    return [];
  }

  const mask = pickMaskFor(horizon, observerHeightM);
  const azStepDeg = horizon?.az_step_deg ?? 0;

  let kStart = Math.max(0, Math.floor((startMs - startMsCov) / stepMs) - 1);
  if (kStart >= ephem.count - 1) {
    return [];
  }

  let prevClearSun =
    ephem.sun.el[kStart] -
    horizonAt(mask, azStepDeg, ephem.sun.az[kStart]);
  let prevClearEarth =
    ephem.earth.el[kStart] -
    horizonAt(mask, azStepDeg, ephem.earth.az[kStart]);

  const rawEvents: RawSkyEvent[] = [];

  for (let k = kStart; k < ephem.count - 1; k++) {
    const tk = startMsCov + k * stepMs;
    if (tk >= endMs) {
      break;
    }

    const kNext = k + 1;
    const nextClearSun =
      ephem.sun.el[kNext] -
      horizonAt(mask, azStepDeg, ephem.sun.az[kNext]);
    const nextClearEarth =
      ephem.earth.el[kNext] -
      horizonAt(mask, azStepDeg, ephem.earth.az[kNext]);

    // Sunset: true -> false
    if (prevClearSun >= 0 && nextClearSun < 0) {
      const frac = prevClearSun / (prevClearSun - nextClearSun);
      const t = tk + frac * stepMs;
      if (t >= startMs && t < endMs) {
        rawEvents.push({
          kind: 'sunset',
          t,
          ms: Math.round(t),
          utc: formatIsoUtc(t),
        });
      }
    }

    // Terminal sample sunset: reaches 0 at the final coverage sample
    if (k === ephem.count - 2 && prevClearSun > 0 && nextClearSun === 0) {
      const t = tk + stepMs;
      if (t >= startMs && t < endMs) {
        rawEvents.push({
          kind: 'sunset',
          t,
          ms: Math.round(t),
          utc: formatIsoUtc(t),
        });
      }
    }

    // Sunrise: false -> true
    if (prevClearSun < 0 && nextClearSun >= 0) {
      const frac = prevClearSun / (prevClearSun - nextClearSun);
      const t = tk + frac * stepMs;
      if (t >= startMs && t < endMs) {
        rawEvents.push({
          kind: 'sunrise',
          t,
          ms: Math.round(t),
          utc: formatIsoUtc(t),
        });
      }
    }

    // Earthset: true -> false
    if (prevClearEarth >= 0 && nextClearEarth < 0) {
      const frac = prevClearEarth / (prevClearEarth - nextClearEarth);
      const t = tk + frac * stepMs;
      if (t >= startMs && t < endMs) {
        rawEvents.push({
          kind: 'earthset',
          t,
          ms: Math.round(t),
          utc: formatIsoUtc(t),
        });
      }
    }

    // Terminal sample Earthset: reaches 0 at the final coverage sample
    if (k === ephem.count - 2 && prevClearEarth > 0 && nextClearEarth === 0) {
      const t = tk + stepMs;
      if (t >= startMs && t < endMs) {
        rawEvents.push({
          kind: 'earthset',
          t,
          ms: Math.round(t),
          utc: formatIsoUtc(t),
        });
      }
    }

    // Earthrise: false -> true
    if (prevClearEarth < 0 && nextClearEarth >= 0) {
      const frac = prevClearEarth / (prevClearEarth - nextClearEarth);
      const t = tk + frac * stepMs;
      if (t >= startMs && t < endMs) {
        rawEvents.push({
          kind: 'earthrise',
          t,
          ms: Math.round(t),
          utc: formatIsoUtc(t),
        });
      }
    }

    prevClearSun = nextClearSun;
    prevClearEarth = nextClearEarth;
  }

  // Filter out phantom grazing pairs at identical millisecond (L4 #1)
  const filteredEvents: RawSkyEvent[] = [];
  const eventKeys = new Set(rawEvents.map((e) => `${e.kind}:${e.ms}`));

  for (const ev of rawEvents) {
    if (ev.kind === 'sunrise' && eventKeys.has(`sunset:${ev.ms}`)) continue;
    if (ev.kind === 'sunset' && eventKeys.has(`sunrise:${ev.ms}`)) continue;
    if (ev.kind === 'earthrise' && eventKeys.has(`earthset:${ev.ms}`)) continue;
    if (ev.kind === 'earthset' && eventKeys.has(`earthrise:${ev.ms}`)) continue;
    filteredEvents.push(ev);
  }

  filteredEvents.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));

  return filteredEvents.map(({ kind, ms, utc }) => ({ kind, ms, utc }));
}

/**
 * Returns longest consecutive runs of Sun-below-horizon and Earth-below-horizon
 * among samples with sample time in [startMs, endMs).
 */
export function longestStretches(
  bundle: Pick<SiteBundle, 'horizon' | 'ephem'>,
  observerHeightM: ObserverHeightM,
  startMs: number,
  endMs: number,
): SkyStretch[] {
  const { ephem, horizon } = bundle;
  if (!ephem || !horizon || ephem.count <= 0 || startMs >= endMs) {
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

  const { startMs: startMsCov } = ephemCoverage(ephem);
  const stepMs = ephem.step_minutes * 60_000;
  if (stepMs <= 0 || !Number.isFinite(startMsCov)) {
    return [];
  }

  // Find range of qualifying sample indices: t_k in [startMs, endMs) and in coverage
  let kStart = Math.max(0, Math.floor((startMs - startMsCov) / stepMs));
  while (kStart < ephem.count && startMsCov + kStart * stepMs < startMs) {
    kStart++;
  }

  let kEnd = Math.min(
    ephem.count,
    Math.ceil((endMs - startMsCov) / stepMs) + 1,
  );
  while (kEnd > kStart && startMsCov + (kEnd - 1) * stepMs >= endMs) {
    kEnd--;
  }

  if (kStart >= kEnd) {
    return [];
  }

  const mask = pickMaskFor(horizon, observerHeightM);
  const azStepDeg = horizon?.az_step_deg ?? 0;

  let maxDarkLen = 0;
  let maxDarkStartK = -1;
  let curDarkLen = 0;
  let curDarkStartK = -1;

  let maxNoEarthLen = 0;
  let maxNoEarthStartK = -1;
  let curNoEarthLen = 0;
  let curNoEarthStartK = -1;

  for (let k = kStart; k < kEnd; k++) {
    const azSun = ephem.sun.az[k];
    const elSun = ephem.sun.el[k];
    const hSun = horizonAt(mask, azStepDeg, azSun);
    const isSunlit = elSun - hSun >= 0;

    if (isSunlit) {
      curDarkLen = 0;
      curDarkStartK = -1;
    } else {
      if (curDarkLen === 0) {
        curDarkStartK = k;
      }
      curDarkLen++;
      if (curDarkLen > maxDarkLen) {
        maxDarkLen = curDarkLen;
        maxDarkStartK = curDarkStartK;
      }
    }

    const azEarth = ephem.earth.az[k];
    const elEarth = ephem.earth.el[k];
    const hEarth = horizonAt(mask, azStepDeg, azEarth);
    const isEarthInView = elEarth - hEarth >= 0;

    if (isEarthInView) {
      curNoEarthLen = 0;
      curNoEarthStartK = -1;
    } else {
      if (curNoEarthLen === 0) {
        curNoEarthStartK = k;
      }
      curNoEarthLen++;
      if (curNoEarthLen > maxNoEarthLen) {
        maxNoEarthLen = curNoEarthLen;
        maxNoEarthStartK = curNoEarthStartK;
      }
    }
  }

  const stretches: SkyStretch[] = [];

  if (maxDarkLen > 0) {
    const stretchStart = startMsCov + maxDarkStartK * stepMs;
    const stretchEnd = stretchStart + maxDarkLen * stepMs;
    stretches.push({
      kind: 'longest_dark',
      startMs: stretchStart,
      endMs: stretchEnd,
      hours: (stretchEnd - stretchStart) / 3_600_000,
    });
  }

  if (maxNoEarthLen > 0) {
    const stretchStart = startMsCov + maxNoEarthStartK * stepMs;
    const stretchEnd = stretchStart + maxNoEarthLen * stepMs;
    stretches.push({
      kind: 'longest_no_earth',
      startMs: stretchStart,
      endMs: stretchEnd,
      hours: (stretchEnd - stretchStart) / 3_600_000,
    });
  }

  return stretches;
}
