import { create } from 'zustand'
import { useAppStore } from '../../state/store'
import type { Mode, Scenario } from '../../state/types'

export type DemoVariant = 'normal' | 'video30s'

export interface PreDemoSnapshot {
  scenarios: Scenario[]
  mode: Mode
  cursorH: number
  activeScenarioId: string
  activeTabId?: string | null
}

export interface DemoState {
  isActive: boolean
  stepIndex: number
  variant: DemoVariant
  snapshot: PreDemoSnapshot | null
  /** True while the current step wants the loupe open on the active card. */
  loupeOpen: boolean
  startDemo: (variant?: DemoVariant) => void
  stopDemo: () => void
  setStepIndex: (stepIndex: number) => void
  nextStep: (totalSteps: number) => void
  setVariant: (variant: DemoVariant) => void
}

export const useDemoStore = create<DemoState>()((set, get) => ({
  isActive: false,
  stepIndex: 0,
  variant: 'normal',
  snapshot: null,
  loupeOpen: false,
  startDemo: (variant = 'normal') => {
    const app = useAppStore.getState()
    const snapshot: PreDemoSnapshot = {
      scenarios: app.scenarios.map((s) => ({ ...s })),
      mode: app.mode,
      cursorH: app.cursorH,
      activeScenarioId: app.activeScenarioId,
      activeTabId:
        typeof document !== 'undefined'
          ? document.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.id ?? null
          : null,
    }
    set({ isActive: true, stepIndex: 0, variant, snapshot })
  },
  stopDemo: () => {
    const { snapshot } = get()
    useAppStore.getState().setPlaying(false)

    if (snapshot) {
      useAppStore.setState({
        scenarios: snapshot.scenarios.map((s) => ({ ...s })),
        mode: snapshot.mode,
        cursorH: snapshot.cursorH,
        activeScenarioId: snapshot.activeScenarioId,
        playing: false,
      })

      if (typeof document !== 'undefined' && snapshot.activeTabId) {
        const tabEl = document.getElementById(snapshot.activeTabId) as HTMLButtonElement | null
        if (tabEl && tabEl.getAttribute('aria-selected') !== 'true') {
          tabEl.click()
        }
      }
    }

    set({ isActive: false, stepIndex: 0, snapshot: null, loupeOpen: false })
  },
  setStepIndex: (stepIndex) => set({ stepIndex }),
  setVariant: (variant) => set({ variant, stepIndex: 0 }),
  nextStep: (totalSteps) =>
    set((s) => ({
      stepIndex: totalSteps > 0 ? (s.stepIndex + 1) % totalSteps : 0,
    })),
}))
