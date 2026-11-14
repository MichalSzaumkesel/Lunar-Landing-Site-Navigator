import { describe, expect, it } from 'vitest'
import type { Site } from '../../lib/types'
import { displayName, groupPlaces, placeHint, quickPlaces } from './placeLabels'

function site(id: string, category: Site['category'], lat = 0, lon = 0): Site {
  return {
    id,
    name: id,
    category,
    mission: null,
    agency: null,
    country: null,
    lat_deg: lat,
    lon_deg: lon,
    elevation_m: null,
    landing_date_utc: null,
    status: 'landed',
    region_radius_km: null,
    source: { title: 't', url: 'https://example.com' },
    notes: '',
  }
}

describe('placeHint', () => {
  it('describes poles, far side, equator and mid latitudes from coordinates', () => {
    expect(placeHint({ lat_deg: -84.8, lon_deg: 29 })).toBe('Near the south pole')
    expect(placeHint({ lat_deg: 85, lon_deg: 0 })).toBe('Near the north pole')
    expect(placeHint({ lat_deg: -45.4, lon_deg: 177.6 })).toBe('Far side of the Moon')
    expect(placeHint({ lat_deg: 0.7, lon_deg: 23.5 })).toBe('Near the equator')
    expect(placeHint({ lat_deg: -45, lon_deg: 30 })).toBe('Southern half')
    expect(placeHint({ lat_deg: 44, lon_deg: -19.5 })).toBe('Northern half')
  })
})

describe('groupPlaces', () => {
  it('groups by plain labels, keeps order and drops empty groups', () => {
    const sites = [site('a', 'international'), site('b', 'apollo'), site('c', 'clps')]
    const groups = groupPlaces(sites)
    expect(groups.map((g) => g.label)).toEqual(['Apollo landings', 'Other landers'])
    expect(groups[1].sites.map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('puts Artemis regions under possible future landing zones', () => {
    expect(groupPlaces([site('r', 'artemis_region')])[0].label).toBe('Possible future landing zones')
  })
})

describe('quickPlaces', () => {
  it('returns the first preferred ids that exist, at most max', () => {
    const sites = [site('x', 'apollo'), site('y', 'clps'), site('z', 'apollo'), site('w', 'clps')]
    expect(quickPlaces(sites, ['q', 'y', 'x', 'z', 'w']).map((s) => s.id)).toEqual(['y', 'x', 'z'])
  })
})

describe('displayName', () => {
  it('strips the mock prefix', () => {
    expect(displayName({ name: '[MOCK] Equatorial site' })).toBe('Equatorial site')
  })
})
