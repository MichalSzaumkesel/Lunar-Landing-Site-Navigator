import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export const EXIT_MS = 150

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
}

export type PresenceState = 'open' | 'closed'

/** Keeps an element mounted for the exit animation. Style with [data-state='closed']. */
export function usePresence(open: boolean, exitMs: number = EXIT_MS): { mounted: boolean; state: PresenceState } {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    if (open) return
    const t = setTimeout(() => setMounted(false), reducedMotion() ? 0 : exitMs)
    return () => clearTimeout(t)
  }, [open, exitMs])
  return { mounted: open || mounted, state: open ? 'open' : 'closed' }
}

/** Like usePresence for an optional value (message, error): keeps the last value while it fades out. */
export function usePresenceValue<T>(
  value: T | null | undefined,
  exitMs: number = EXIT_MS,
): { mounted: boolean; state: PresenceState; value: T | null } {
  const present = value !== null && value !== undefined
  const [last, setLast] = useState<T | null>(present ? value : null)
  if (present && last !== value) setLast(value)
  const { mounted, state } = usePresence(present, exitMs)
  return { mounted, state, value: present ? value : last }
}

export interface PresenceItem<T> {
  item: T
  state: PresenceState
}

/** Keeps removed list items rendered (state 'closed') for the exit animation, at their old position. */
export function usePresenceList<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  exitMs: number = EXIT_MS,
): PresenceItem<T>[] {
  const prev = useRef<readonly T[]>(items)
  const [ghosts, setGhosts] = useState<{ item: T; index: number }[]>([])

  useLayoutEffect(() => {
    const before = prev.current
    prev.current = items
    const keys = new Set(items.map(getKey))
    const removed = before.map((item, index) => ({ item, index })).filter((p) => !keys.has(getKey(p.item)))
    if (removed.length === 0 || reducedMotion()) return
    setGhosts((g) => [...g, ...removed])
    const gone = new Set(removed.map((r) => getKey(r.item)))
    setTimeout(() => setGhosts((g) => g.filter((x) => !gone.has(getKey(x.item)))), exitMs)
    // getKey is expected to be stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, exitMs])

  const out: PresenceItem<T>[] = items.map((item) => ({ item, state: 'open' }))
  const live = new Set(items.map(getKey))
  for (const g of [...ghosts].sort((a, b) => a.index - b.index)) {
    if (live.has(getKey(g.item))) continue
    out.splice(Math.min(g.index, out.length), 0, { item: g.item, state: 'closed' })
  }
  return out
}
