import { useEffect } from 'react'
import { MAX_SCENARIOS } from '../config/dataRange'
import type { AppState, Scenario } from './types'
import { useAppStore } from './store'
import { decodeState, encodeState, type UrlState } from './urlState'

function serializeShareable(
  mode: string,
  observerHeightM: number,
  speedHPerSec: number,
  scenarios: Scenario[],
): string {
  const scStr = scenarios
    .map((s) => `${s.siteId}~${s.startUtc}~${s.durationH}~${s.slipDays}`)
    .join(';')
  return `${mode}|${observerHeightM}|${speedHPerSec}|${scStr}`
}

function applyHashToStore(): void {
  if (typeof window === 'undefined') return
  const initialHash = window.location.hash
  if (!initialHash) return
  const decoded = decodeState(initialHash)
  const patch: Partial<AppState> = {}

  if (decoded.mode !== undefined) {
    patch.mode = decoded.mode
  }
  if (decoded.observerHeightM !== undefined) {
    patch.observerHeightM = decoded.observerHeightM
  }
  if (decoded.speedHPerSec !== undefined) {
    patch.speedHPerSec = decoded.speedHPerSec
  }
  if (decoded.cursorH !== undefined) {
    patch.cursorH = decoded.cursorH
  }

  if (Array.isArray(decoded.scenarios) && decoded.scenarios.length > 0) {
    const safeScenarios = decoded.scenarios.slice(0, MAX_SCENARIOS)
    const existingIds = new Set(
      useAppStore.getState().scenarios.map((s) => s.id),
    )
    let counter = 1
    const freshScenarios: Scenario[] = safeScenarios.map((sc) => {
      while (existingIds.has(`sc${counter}`)) {
        counter++
      }
      const id = `sc${counter}`
      existingIds.add(id)
      return {
        id,
        siteId: sc.siteId,
        startUtc: sc.startUtc,
        durationH: sc.durationH,
        slipDays: sc.slipDays,
      }
    })
    patch.scenarios = freshScenarios
    patch.activeScenarioId = freshScenarios[0].id
  }

  if (Object.keys(patch).length > 0) {
    useAppStore.setState(patch)
  }
}

/** Returns the current full URL including a hash that contains the cursor as well. */
export function shareUrl(): string {
  if (typeof window === 'undefined') return ''
  const s = useAppStore.getState()
  const urlState: UrlState = {
    mode: s.mode,
    observerHeightM: s.observerHeightM,
    scenarios: s.scenarios.map((sc) => ({
      siteId: sc.siteId,
      startUtc: sc.startUtc,
      durationH: sc.durationH,
      slipDays: sc.slipDays,
    })),
    cursorH: s.cursorH,
    speedHPerSec: s.speedHPerSec,
  }
  const hash = encodeState(urlState)
  const url = new URL(window.location.href)
  url.hash = hash
  return url.toString()
}

export function useUrlSync(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // On mount: read window.location.hash and apply to store
    applyHashToStore()

    const onHashChange = () => {
      applyHashToStore()
    }
    window.addEventListener('hashchange', onHashChange)

    // Afterwards: when shareable store changes, write hash debounced by 300 ms
    const current = useAppStore.getState()
    let lastKey = serializeShareable(
      current.mode,
      current.observerHeightM,
      current.speedHPerSec,
      current.scenarios,
    )
    let timer: ReturnType<typeof setTimeout> | null = null

    const unsubscribe = useAppStore.subscribe((state) => {
      const key = serializeShareable(
        state.mode,
        state.observerHeightM,
        state.speedHPerSec,
        state.scenarios,
      )

      if (key !== lastKey) {
        lastKey = key
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          const s = useAppStore.getState()
          const urlState: UrlState = {
            mode: s.mode,
            observerHeightM: s.observerHeightM,
            scenarios: s.scenarios.map((sc) => ({
              siteId: sc.siteId,
              startUtc: sc.startUtc,
              durationH: sc.durationH,
              slipDays: sc.slipDays,
            })),
            cursorH: 0,
            speedHPerSec: s.speedHPerSec,
          }
          const hash = encodeState(urlState)
          window.history.replaceState(null, '', '#' + hash)
        }, 300)
      }
    })

    return () => {
      window.removeEventListener('hashchange', onHashChange)
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
