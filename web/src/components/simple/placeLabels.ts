import type { Site, SiteCategory } from '../../lib/types'

export interface PlaceGroup {
  id: 'apollo' | 'missions' | 'future'
  label: string
  sites: Site[]
}

const GROUP_OF: Record<SiteCategory, PlaceGroup['id']> = {
  apollo: 'apollo',
  clps: 'missions',
  commercial: 'missions',
  international: 'missions',
  custom: 'missions',
  artemis_region: 'future',
}

const GROUP_LABEL: Record<PlaceGroup['id'], string> = {
  apollo: 'Apollo landings',
  missions: 'Other landers',
  future: 'Possible future landing zones',
}

/** Removes the "[MOCK]" prefix that synthetic sites carry. */
export function displayName(site: Pick<Site, 'name'>): string {
  return site.name.replace(/^\[MOCK\]\s*/i, '')
}

/** One plain phrase about where the place is, derived from its coordinates only. */
export function placeHint(site: Pick<Site, 'lat_deg' | 'lon_deg'>): string {
  const lat = site.lat_deg
  if (Math.abs(lat) >= 80) return lat < 0 ? 'Near the south pole' : 'Near the north pole'
  // Longitudes beyond 90 degrees east or west face away from Earth.
  if (Math.abs(site.lon_deg) > 90) return 'Far side of the Moon'
  if (Math.abs(lat) <= 30) return 'Near the equator'
  return lat < 0 ? 'Southern half' : 'Northern half'
}

/** Groups sites for the picker, keeping the data order inside each group and dropping empty ones. */
export function groupPlaces(sites: readonly Site[]): PlaceGroup[] {
  const ids: PlaceGroup['id'][] = ['apollo', 'missions', 'future']
  return ids
    .map((id) => ({
      id,
      label: GROUP_LABEL[id],
      sites: sites.filter((s) => GROUP_OF[s.category] === id),
    }))
    .filter((g) => g.sites.length > 0)
}

/** The first `max` preferred ids that exist in the data, in the preferred order. */
export function quickPlaces(sites: readonly Site[], preferred: readonly string[], max = 3): Site[] {
  const picked: Site[] = []
  for (const id of preferred) {
    const site = sites.find((s) => s.id === id)
    if (site) picked.push(site)
    if (picked.length === max) break
  }
  return picked
}
