// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import { shareUrl } from '../../state/useUrlSync'
import * as exportCsv from '../../lib/exportCsv'
import type { SiteBundle, SiteDataSource } from '../../lib/types'
import { copyShareLink, exportScenariosCsv } from './shareActions'

function bundle(siteId: string, name: string): SiteBundle {
  const meta = {
    contract_version: '1.1.1',
    generated_utc: '2026-11-14T00:00:00Z',
    generator: 'test',
    synthetic: true,
    approximate: false,
    inputs: [],
  }
  return {
    synthetic: true,
    approximate: false,
    site: {
      id: siteId,
      name,
      category: 'apollo',
      mission: 'm',
      agency: 'a',
      country: 'c',
      lat_deg: 1.5,
      lon_deg: -20.25,
      elevation_m: null,
      landing_date_utc: null,
      status: 'landed',
      region_radius_km: null,
      source: { title: 't', url: '' },
      notes: '',
    },
    horizon: {
      meta,
      site_id: siteId,
      az_step_deg: 360,
      n: 1,
      observer_heights_m: [2, 10],
      masks: { '2': [0], '10': [0] },
    },
    ephem: {
      meta,
      site_id: siteId,
      start_utc: '2027-01-01T00:00:00Z',
      step_minutes: 60,
      count: 3,
      sun: { az: [0, 0, 0], el: [10, 5, -5] },
      earth: { az: [0, 0, 0], el: [10, 10, 10] },
      sun_ang_radius_deg: 0.2666,
      earth_ang_radius_deg: 0.95,
    },
  } as unknown as SiteBundle
}

const sc = (id: string, siteId: string) => ({
  id,
  siteId,
  startUtc: '2027-01-01T00:00:00Z',
  durationH: 2,
  slipDays: 0,
})

beforeEach(() => {
  useAppStore.setState({ scenarios: [sc('sc1', 'site_a')], activeScenarioId: 'sc1', cursorH: 0, observerHeightM: 2 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('exportScenariosCsv', () => {
  it('throws when there are no scenarios', async () => {
    useAppStore.setState({ scenarios: [] })
    const ds = { loadSite: vi.fn() } as unknown as SiteDataSource
    await expect(exportScenariosCsv(ds)).rejects.toThrow('No scenarios to export.')
    expect(ds.loadSite).not.toHaveBeenCalled()
  })

  it('downloads one CSV row per scenario with a UTC date-stamped filename', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-03-09T23:59:59Z'))
    useAppStore.setState({ scenarios: [sc('sc1', 'site_a'), sc('sc2', 'site_b')] })
    const ds = {
      loadSite: vi.fn(async (id: string) => bundle(id, id === 'site_a' ? 'Alpha' : 'Beta')),
    } as unknown as SiteDataSource
    const spy = vi.spyOn(exportCsv, 'downloadText').mockImplementation(() => {})

    await exportScenariosCsv(ds)

    expect(ds.loadSite).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledTimes(1)
    const [filename, csv] = spy.mock.calls[0]
    expect(filename).toBe('lunar-scenarios-20270309.csv')
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 rows
    expect(lines[1]).toContain('Alpha')
    expect(lines[1]).toContain('site_a')
    expect(lines[1]).toContain('2027-01-01T00:00:00Z')
    expect(lines[1]).toContain('2027-01-01T02:00:00Z')
    expect(lines[2]).toContain('Beta')
  })

  it('propagates a loader failure', async () => {
    const ds = { loadSite: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as SiteDataSource
    await expect(exportScenariosCsv(ds)).rejects.toThrow('boom')
  })
})

describe('copyShareLink', () => {
  it('resolves to null after writing the share URL to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(copyShareLink()).resolves.toBeNull()
    expect(writeText).toHaveBeenCalledWith(shareUrl())
  })

  it('resolves to the URL when the clipboard write is rejected', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const url = await copyShareLink()
    expect(url).toBe(shareUrl())
    expect(url).toBeTruthy()
  })

  it('resolves to the URL when there is no clipboard API', async () => {
    vi.stubGlobal('navigator', {})
    await expect(copyShareLink()).resolves.toBe(shareUrl())
  })
})
