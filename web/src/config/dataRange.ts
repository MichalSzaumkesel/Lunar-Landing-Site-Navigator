// Coverage of the ephemeris files, contract §2.3: hourly, both ends inclusive.
export const DATA_START_UTC = '2026-12-01T00:00:00Z'
export const DATA_END_UTC = '2028-12-31T23:00:00Z'
export const DATA_STEP_MINUTES = 60

export const DATA_START_MS = Date.parse(DATA_START_UTC)
export const DATA_END_MS = Date.parse(DATA_END_UTC)

export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** Timeline default range limits (kept inside the data coverage). */
export const MAX_SLIP_DAYS = 60
export const MAX_SCENARIOS = 4
