import { useEffect, useState } from 'react'

export interface BasemapInfo {
  /** Absolute URL of the image. */
  imageUrl: string
  credit: string
  creditUrl: string | null
  width: number
  height: number
  /** Polar only: [xmin, xmax, ymin, ymax] in projected metres. */
  extentM: [number, number, number, number] | null
}

export interface IllumGrid {
  siteId: string
  lat: number
  lon: number
  spacingM: number
  nx: number
  ny: number
  pct: number[][]
  approximate: boolean
  periodStart: string
  periodEnd: string
}

const base = (): string => import.meta.env?.BASE_URL ?? '/'

async function fetchJsonOrNull(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

const basemapCache = new Map<string, Promise<BasemapInfo | null>>()

/** Loads basemap/<name>.json. Resolves null when the files are not there (the map then renders without relief). */
export function loadBasemap(name: 'global' | 'southpole'): Promise<BasemapInfo | null> {
  let p = basemapCache.get(name)
  if (!p) {
    p = (async () => {
      const j = await fetchJsonOrNull(`${base()}data/basemap/${name}.json`)
      if (!j || typeof j.image !== 'string') return null
      const meta = j.meta as { inputs?: Array<{ url?: string }> } | undefined
      const ext = j.extent_m
      return {
        imageUrl: `${base()}data/${j.image}`,
        credit: typeof j.credit === 'string' ? j.credit : '',
        creditUrl: meta?.inputs?.[0]?.url ?? null,
        width: Number(j.width) || 0,
        height: Number(j.height) || 0,
        extentM:
          Array.isArray(ext) && ext.length === 4
            ? [Number(ext[0]), Number(ext[1]), Number(ext[2]), Number(ext[3])]
            : null,
      }
    })()
    basemapCache.set(name, p)
  }
  return p
}

export function useBasemap(name: 'global' | 'southpole'): BasemapInfo | null {
  const [info, setInfo] = useState<BasemapInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    loadBasemap(name).then((r) => {
      if (!cancelled) setInfo(r)
    })
    return () => {
      cancelled = true
    }
  }, [name])
  return info
}

const illumCache = new Map<string, Promise<IllumGrid | null>>()

export function loadIllum(siteId: string): Promise<IllumGrid | null> {
  let p = illumCache.get(siteId)
  if (!p) {
    p = (async () => {
      const j = await fetchJsonOrNull(`${base()}data/illum/${siteId}.json`)
      const g = j?.grid as
        | { center_lat: number; center_lon: number; spacing_m: number; nx: number; ny: number }
        | undefined
      const pct = j?.pct_sunlit
      if (!j || !g || !Array.isArray(pct)) return null
      const meta = j.meta as { approximate?: boolean } | undefined
      const period = j.period as { start_utc?: string; end_utc?: string } | undefined
      return {
        siteId,
        lat: g.center_lat,
        lon: g.center_lon,
        spacingM: g.spacing_m,
        nx: g.nx,
        ny: g.ny,
        pct: pct as number[][],
        approximate: meta?.approximate !== false,
        periodStart: period?.start_utc?.slice(0, 10) ?? '',
        periodEnd: period?.end_utc?.slice(0, 10) ?? '',
      }
    })()
    illumCache.set(siteId, p)
  }
  return p
}
