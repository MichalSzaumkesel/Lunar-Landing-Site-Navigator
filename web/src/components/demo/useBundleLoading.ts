import { useEffect, useState } from 'react'
import { dataSource } from '../../lib/loader'
import { DEMO_SITE_IDS } from '../../lib/prefetch'
import { useAppStore } from '../../state/store'

/**
 * Returns true if any bundle for current scenarios or demo sites is still being fetched.
 */
export function useBundleLoading(): boolean {
  const scenarios = useAppStore((s) => s.scenarios)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const siteIds = Array.from(new Set([...DEMO_SITE_IDS, ...scenarios.map((s) => s.siteId)]))

    Promise.allSettled(siteIds.map((id) => dataSource.loadSite(id))).then(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [scenarios])

  return loading
}
