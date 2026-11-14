// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_SITE_IDS, prefetchDemoSites, resetPrefetchForTest } from './prefetch'
import type { SiteBundle, SiteDataSource } from './types'

describe('prefetchDemoSites', () => {
  beforeEach(() => {
    resetPrefetchForTest()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prefetches all three demo site IDs via loadSite', async () => {
    const loaded: string[] = []
    const mockSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn((id: string) => {
        loaded.push(id)
        return Promise.resolve({ site: { id } } as unknown as SiteBundle)
      }),
      loadCustomSite: vi.fn(),
    }

    await prefetchDemoSites(DEMO_SITE_IDS, mockSource)

    expect(loaded).toEqual([...DEMO_SITE_IDS])
    expect(mockSource.loadSite).toHaveBeenCalledTimes(3)
  })

  it('ignores failures when loadSite rejects or throws', async () => {
    const mockSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn((id: string) => {
        if (id === 'artemis_region_1') {
          return Promise.reject(new Error('Network offline or 404'))
        }
        return Promise.resolve({ site: { id } } as unknown as SiteBundle)
      }),
      loadCustomSite: vi.fn(),
    }

    // Must resolve cleanly and not throw
    await expect(prefetchDemoSites(DEMO_SITE_IDS, mockSource)).resolves.toBeUndefined()
    expect(mockSource.loadSite).toHaveBeenCalledTimes(3)
  })

  it('uses requestIdleCallback when available in window', async () => {
    const scheduleSpy = vi.fn((cb: IdleRequestCallback) => {
      cb({ didTimeout: false, timeRemaining: () => 50 })
      return 1
    })

    const originalRic = (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
    ;(window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback = scheduleSpy

    const mockSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn(() => Promise.resolve({} as unknown as SiteBundle)),
      loadCustomSite: vi.fn(),
    }

    try {
      await prefetchDemoSites(['site_1'], mockSource)
      expect(scheduleSpy).toHaveBeenCalled()
      expect(mockSource.loadSite).toHaveBeenCalledWith('site_1')
    } finally {
      ;(window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback = originalRic
    }
  })

  it('falls back to setTimeout when requestIdleCallback is absent', async () => {
    const originalRic = (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback
    delete (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback

    const mockSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn(() => Promise.resolve({} as unknown as SiteBundle)),
      loadCustomSite: vi.fn(),
    }

    try {
      await prefetchDemoSites(['site_fallback'], mockSource)
      expect(mockSource.loadSite).toHaveBeenCalledWith('site_fallback')
    } finally {
      if (originalRic !== undefined) {
        ;(window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback = originalRic
      }
    }
  })

  it('prefetches binary terrain heightmaps when terrain is present in the bundle (L5 #6)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response())
    const origFetch = globalThis.fetch
    globalThis.fetch = fetchSpy

    const mockBundleWithTerrain = {
      site: { id: 'test_site' },
      terrain: {
        bin: 'terrain/test_site.bin',
        meta: { synthetic: true },
      },
    } as unknown as SiteBundle

    const mockSource: SiteDataSource = {
      loadSites: vi.fn(),
      loadSite: vi.fn(() => Promise.resolve(mockBundleWithTerrain)),
      loadCustomSite: vi.fn(),
    }

    try {
      await prefetchDemoSites(['test_site'], mockSource)
      expect(fetchSpy).toHaveBeenCalledWith('/data/mock/terrain/test_site.bin')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
