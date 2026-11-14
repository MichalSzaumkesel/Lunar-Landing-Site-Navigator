import type { SkyPosition } from './ephem.ts';

export type EarthPhaseName = 'new' | 'crescent' | 'half' | 'gibbous' | 'full';

/** Unit vector (east, north, up) in the local topocentric frame. */
function toUnitVector(pos: SkyPosition): [number, number, number] {
  const azRad = (pos.az * Math.PI) / 180;
  const elRad = (pos.el * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  return [
    Math.sin(azRad) * cosEl, // east
    Math.cos(azRad) * cosEl, // north
    Math.sin(elRad), // up
  ];
}

function dotProduct(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Angular separation between two sky positions in degrees.
 * Clamps the dot product of local frame unit vectors into [-1, 1].
 */
export function angularSeparationDeg(a: SkyPosition, b: SkyPosition): number {
  const u = toUnitVector(a);
  const v = toUnitVector(b);
  const dot = Math.max(-1, Math.min(1, dotProduct(u, v)));
  return (Math.acos(dot) * 180) / Math.PI;
}

/**
 * Lit fraction of Earth as seen from the Moon (0..1).
 * Phase angle is 180 deg minus Sun-Earth separation e, lit fraction = (1 - cos e) / 2.
 */
export function earthIlluminatedFraction(
  sun: SkyPosition,
  earth: SkyPosition,
): number {
  const eDeg = angularSeparationDeg(sun, earth);
  const eRad = (eDeg * Math.PI) / 180;
  const frac = (1 - Math.cos(eRad)) / 2;
  return Math.max(0, Math.min(1, frac));
}

/**
 * Earth phase category name from lit fraction.
 * < 0.05 new, < 0.45 crescent, <= 0.55 half, < 0.95 gibbous, otherwise full.
 */
export function earthPhaseName(fraction: number): EarthPhaseName {
  if (fraction < 0.05) {
    return 'new';
  }
  if (fraction < 0.45) {
    return 'crescent';
  }
  if (fraction <= 0.55) {
    return 'half';
  }
  if (fraction < 0.95) {
    return 'gibbous';
  }
  return 'full';
}

/**
 * Unit vector (east, north, up) pointing from Earth centre towards the lit limb.
 * Sun direction with its component along Earth direction removed, normalised.
 * If Sun and Earth are collinear (degenerate), returns [0, 0, 0].
 */
export function brightLimbDirection(
  earth: SkyPosition,
  sun: SkyPosition,
): [number, number, number] {
  const e = toUnitVector(earth);
  const s = toUnitVector(sun);
  const d = dotProduct(s, e);

  const vx = s[0] - d * e[0];
  const vy = s[1] - d * e[1];
  const vz = s[2] - d * e[2];

  const len = Math.hypot(vx, vy, vz);
  if (len < 1e-9) {
    return [0, 0, 0];
  }

  const clean = (val: number): number => {
    const res = val / len;
    return Object.is(res, -0) ? 0 : res;
  };

  return [clean(vx), clean(vy), clean(vz)];
}
