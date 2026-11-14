import { create } from 'zustand'

export interface TourState {
  isOpen: boolean
  stepIndex: number
  dontShowAgain: boolean
  previousFocus: HTMLElement | null
  openTour: (stepIndex?: number) => void
  closeTour: () => void
  setStepIndex: (stepIndex: number) => void
  setDontShowAgain: (val: boolean) => void
}

export const useTourStore = create<TourState>()((set) => ({
  isOpen: false,
  stepIndex: 0,
  dontShowAgain: false,
  previousFocus: null,
  openTour: (stepIndex = 0) => {
    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
    const previousFocus = active && active !== document.body ? active : null
    set({ isOpen: true, stepIndex, dontShowAgain: false, previousFocus })
  },
  closeTour: () => set({ isOpen: false }),
  setStepIndex: (stepIndex) => set({ stepIndex }),
  setDontShowAgain: (dontShowAgain) => set({ dontShowAgain }),
}))

const inMemoryDone = new Set<string>()

export function getStoredTourStatus(mode: string): string | null {
  try {
    return localStorage.getItem(`lunar.tour.${mode}`)
  } catch {
    return inMemoryDone.has(mode) ? 'done' : null
  }
}

export function setStoredTourStatus(mode: string, value: string): void {
  try {
    localStorage.setItem(`lunar.tour.${mode}`, value)
  } catch {
    if (value === 'done') {
      inMemoryDone.add(mode)
    }
  }
}
