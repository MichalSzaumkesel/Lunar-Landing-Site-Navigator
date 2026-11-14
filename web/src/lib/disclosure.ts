// Shared open/closed state of the Advanced-mode disclosure sections.
// The user's choice is remembered per section in localStorage; the tour and the demo can force a
// section open for a step without overwriting that choice.
import { create } from 'zustand'

export type SectionKey = 'dates' | 'metrics' | 'timeline' | 'rules' | 'explore'
export type ExploreTab = 'sites' | 'moon-map' | 'window-map'

const PREFIX = 'lunar.disclosure.'

function readStored(key: SectionKey): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === '1'
  } catch {
    return false
  }
}

function writeStored(key: SectionKey, open: boolean): void {
  try {
    localStorage.setItem(PREFIX + key, open ? '1' : '0')
  } catch {
    // Storage can be blocked; the in-memory state still works.
  }
}

interface DisclosureState {
  /** The user's own choice per section; undefined means not read yet. */
  stored: Partial<Record<SectionKey, boolean>>
  /** Sections held open by the tour or the demo. */
  forced: readonly SectionKey[]
  exploreTab: ExploreTab
  setOpen: (key: SectionKey, open: boolean) => void
  /** Replaces the forced set; an empty list releases it. */
  setForced: (keys: readonly SectionKey[]) => void
  setExploreTab: (tab: ExploreTab) => void
  /** Opens the explore area on a tab (one click from anywhere). */
  openExplore: (tab: ExploreTab) => void
}

export const useDisclosureStore = create<DisclosureState>()((set) => ({
  stored: {},
  forced: [],
  exploreTab: 'sites',
  setOpen: (key, open) => {
    writeStored(key, open)
    set((s) => ({ stored: { ...s.stored, [key]: open } }))
  },
  setForced: (forced) =>
    set((s) =>
      s.forced.length === forced.length && s.forced.every((k, i) => k === forced[i]) ? s : { forced },
    ),
  setExploreTab: (exploreTab) => set({ exploreTab }),
  openExplore: (tab) => {
    writeStored('explore', true)
    set((s) => ({ exploreTab: tab, stored: { ...s.stored, explore: true } }))
  },
}))

/** Effective open state: forced by tour/demo, else the stored choice (read lazily), else collapsed. */
export function selectOpen(s: DisclosureState, key: SectionKey): boolean {
  if (s.forced.includes(key)) return true
  return s.stored[key] ?? readStored(key)
}

export function useDisclosure(key: SectionKey): { open: boolean; setOpen: (open: boolean) => void } {
  const open = useDisclosureStore((s) => selectOpen(s, key))
  const setOpen = useDisclosureStore((s) => s.setOpen)
  return { open, setOpen: (v) => setOpen(key, v) }
}

const TARGET_SECTIONS: readonly [string, SectionKey][] = [
  ['timeline', 'timeline'],
  ['chips', 'metrics'],
  ['scenario-controls', 'dates'],
  ['panels', 'explore'],
]

/** Sections that must be open for a tour target selector such as [data-tour="chips"]. */
export function sectionsForTarget(selector: string): SectionKey[] {
  return TARGET_SECTIONS.filter(([name]) => selector.includes(`"${name}"`)).map(([, key]) => key)
}

/** Opens what a tour step or demo step needs; an empty result releases earlier forcing. */
export function revealSections(keys: readonly SectionKey[]): void {
  useDisclosureStore.getState().setForced(keys)
}
