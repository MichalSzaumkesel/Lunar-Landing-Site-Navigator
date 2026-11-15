import type { EphemFile } from './types.ts'

/** Shown wherever the copy action is unavailable because the ephemeris file carries no query. */
export const HORIZONS_QUERY_MISSING = 'Not recorded for this site.'

/**
 * The JPL Horizons query recorded in the ephemeris meta (`horizons_query`), serialised as it is stored:
 * the same keys and values, nothing added or rebuilt. Null when the file does not record one.
 */
export function horizonsQueryText(ephem: Pick<EphemFile, 'horizons_query'> | null | undefined): string | null {
  const q = ephem?.horizons_query
  if (!q || typeof q !== 'object' || Object.keys(q).length === 0) return null
  return JSON.stringify(q)
}
