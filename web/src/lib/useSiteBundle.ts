import { useEffect, useState } from 'react'
import { dataSource } from './loader'
import type { SiteBundle } from './types'

export type SiteBundleStatus = 'loading' | 'ready' | 'error'

export interface SiteBundleState {
  status: SiteBundleStatus
  bundle: SiteBundle | null
  error: string | null
}

interface Settled {
  siteId: string
  bundle: SiteBundle | null
  error: string | null
}

const LOADING: SiteBundleState = { status: 'loading', bundle: null, error: null }

// Resolved bundles by id, so a remounted consumer (or the second one on a card) renders at once.
// The loader caches too; this only removes the one-frame skeleton.
const resolved = new Map<string, SiteBundle>()

/** Loads one site through the data source. Stale results (id changed, unmounted) are dropped. */
export function useSiteBundle(siteId: string): SiteBundleState {
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (!siteId || resolved.has(siteId)) return
    let cancelled = false
    dataSource.loadSite(siteId).then(
      (bundle) => {
        resolved.set(siteId, bundle)
        if (!cancelled) setSettled({ siteId, bundle, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err.message : String(err)
        setSettled({ siteId, bundle: null, error })
      },
    )
    return () => {
      cancelled = true
    }
  }, [siteId])

  if (!siteId) return LOADING
  const cached = resolved.get(siteId)
  if (cached) return { status: 'ready', bundle: cached, error: null }
  if (settled && settled.siteId === siteId) {
    if (settled.bundle) return { status: 'ready', bundle: settled.bundle, error: null }
    return { status: 'error', bundle: null, error: settled.error ?? 'Failed to load site data' }
  }
  return LOADING
}
