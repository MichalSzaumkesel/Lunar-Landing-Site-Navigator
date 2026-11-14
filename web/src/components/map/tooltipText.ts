import type { SiteCategory, SiteStatus } from '../../lib/types'

const CATEGORY_LABEL: Record<SiteCategory, string> = {
  apollo: 'Apollo',
  clps: 'CLPS',
  commercial: 'Commercial',
  international: 'International',
  artemis_region: 'Artemis candidate region',
  custom: 'Custom point',
}

const STATUS_LABEL: Record<SiteStatus, string> = {
  landed: 'Landed',
  crashed: 'Crashed',
  planned: 'Planned',
  candidate_region: 'Candidate region',
}

/** "84.79°S, 29.20°E": 2 decimals, hemisphere letters instead of signs. */
export function formatLatLonHemi(lat: number, lon: number): string {
  const la = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}`
  const lo = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`
  return `${la}, ${lo}`
}

export function categoryLabel(c: SiteCategory): string {
  return CATEGORY_LABEL[c] ?? c
}

export function statusLabel(s: SiteStatus | null | undefined): string | null {
  return s ? (STATUS_LABEL[s] ?? s) : null
}

/** Centre of a marker element (its .map-marker__target hit circle, which is never transformed) in container px. */
export function markerAnchor(markerEl: Element, container: HTMLElement | null): { x: number; y: number } | null {
  if (!container) return null
  const target = markerEl.querySelector('.map-marker__target') ?? markerEl
  const r = target.getBoundingClientRect()
  const c = container.getBoundingClientRect()
  return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top }
}
