import { useEffect, useState } from 'react'
import type { TerrainFile } from '../lib/types'
import { decodeHeights, terrainBinUrl } from './terrain'

const resolved = new Map<string, Float32Array>()
const pending = new Map<string, Promise<Float32Array>>()

function keyOf(t: TerrainFile): string {
  return terrainBinUrl(import.meta.env.BASE_URL, t)
}

/** Fetch and decode a terrain .bin once per URL. */
export function loadTerrainHeights(t: TerrainFile): Promise<Float32Array> {
  const url = keyOf(t)
  const hit = resolved.get(url)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(url)
  if (!p) {
    p = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Terrain file not found (${res.status})`)
        return res.arrayBuffer()
      })
      .then((buf) => {
        const heights = decodeHeights(buf, t)
        resolved.set(url, heights)
        return heights
      })
      .finally(() => pending.delete(url))
    pending.set(url, p)
  }
  return p
}

export type TerrainHeightsStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TerrainHeightsState {
  status: TerrainHeightsStatus
  heights: Float32Array | null
  error: string | null
}

const IDLE: TerrainHeightsState = { status: 'idle', heights: null, error: null }
const LOADING: TerrainHeightsState = { status: 'loading', heights: null, error: null }

interface Settled {
  key: string
  heights: Float32Array | null
  error: string | null
}

/** Heights of one terrain file (metres relative to the site), cached per URL. */
export function useTerrainHeights(terrain: TerrainFile | null): TerrainHeightsState {
  const [settled, setSettled] = useState<Settled | null>(null)
  const key = terrain ? keyOf(terrain) : null

  useEffect(() => {
    if (!terrain || !key || resolved.has(key)) return
    let cancelled = false
    loadTerrainHeights(terrain).then(
      (heights) => {
        if (!cancelled) setSettled({ key, heights, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        setSettled({ key, heights: null, error: err instanceof Error ? err.message : String(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [terrain, key])

  if (!key) return IDLE
  const cached = resolved.get(key)
  if (cached) return { status: 'ready', heights: cached, error: null }
  if (settled && settled.key === key) {
    if (settled.heights) return { status: 'ready', heights: settled.heights, error: null }
    return { status: 'error', heights: null, error: settled.error ?? 'Failed to load terrain' }
  }
  return LOADING
}
