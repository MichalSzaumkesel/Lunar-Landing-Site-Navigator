export function normalizeAz(azDeg: number): number {
  let az = azDeg % 360;
  if (az < 0) {
    az += 360;
  }
  if (az >= 360 || Object.is(az, -0)) {
    az = 0;
  }
  return az;
}

export function horizonAt(
  mask: readonly number[],
  azStepDeg: number,
  azDeg: number,
): number {
  const n = mask.length;
  if (n === 0) {
    return 0;
  }
  if (n === 1) {
    return mask[0];
  }
  if (azStepDeg <= 0) {
    return mask[0];
  }

  const az = normalizeAz(azDeg);
  const indexFloat = az / azStepDeg;
  let i0 = Math.floor(indexFloat);
  const frac = indexFloat - i0;
  i0 = ((i0 % n) + n) % n;
  const i1 = (i0 + 1) % n;

  return mask[i0] + frac * (mask[i1] - mask[i0]);
}
