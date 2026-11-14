export interface ValidationResult {
  valid: boolean
  lat?: number
  lon?: number
  error?: string
}

/** Validates latitude string. Latitude must be finite and between -90 and 90 degrees. */
export function validateLatitude(
  latStr: string,
): { valid: true; value: number } | { valid: false; error: string } {
  const trimmed = latStr.trim()
  if (!trimmed) {
    return { valid: false, error: 'Latitude is required.' }
  }
  const val = Number(trimmed)
  if (!Number.isFinite(val)) {
    return { valid: false, error: 'Latitude must be a valid number.' }
  }
  if (val < -90 || val > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90.' }
  }
  return { valid: true, value: Object.is(val, -0) ? 0 : val }
}

/** Validates longitude string. Longitude must be finite and between -180 and 180 degrees. */
export function validateLongitude(
  lonStr: string,
): { valid: true; value: number } | { valid: false; error: string } {
  const trimmed = lonStr.trim()
  if (!trimmed) {
    return { valid: false, error: 'Longitude is required.' }
  }
  const val = Number(trimmed)
  if (!Number.isFinite(val)) {
    return { valid: false, error: 'Longitude must be a valid number.' }
  }
  if (val < -180 || val > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180.' }
  }
  return { valid: true, value: Object.is(val, -0) ? 0 : val }
}

/** Validates latitude and longitude strings for custom site creation. */
export function validateCoordInputs(latStr: string, lonStr: string): ValidationResult {
  const latRes = validateLatitude(latStr)
  if (!latRes.valid) {
    return { valid: false, error: latRes.error }
  }
  const lonRes = validateLongitude(lonStr)
  if (!lonRes.valid) {
    return { valid: false, error: lonRes.error }
  }
  return {
    valid: true,
    lat: latRes.value,
    lon: lonRes.value,
  }
}

/** Formats coordinates as 2 decimal places with N/S and E/W indicators (e.g. "89.50°S, 45.00°E"). */
export function formatCoordDisplay(lat: number, lon: number): string {
  const latSafe = Object.is(lat, -0) ? 0 : lat
  const lonSafe = Object.is(lon, -0) ? 0 : lon

  const latDir = latSafe >= 0 ? 'N' : 'S'
  const lonDir = lonSafe >= 0 ? 'E' : 'W'

  const latAbs = Math.abs(latSafe).toFixed(2)
  const lonAbs = Math.abs(lonSafe).toFixed(2)

  return `${latAbs}°${latDir}, ${lonAbs}°${lonDir}`
}

/** Rounds a coordinate to 1 decimal place, avoiding -0. */
export function round1(val: number): number {
  const r = Math.round(val * 10) / 10
  return Object.is(r, -0) ? 0 : r
}
