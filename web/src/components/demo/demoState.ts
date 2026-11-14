import { create } from 'zustand'

export type DemoVariant = 'normal' | 'video30s'

export interface DemoState {
  isActive: boolean
  stepIndex: number
  variant: DemoVariant
  startDemo: (variant?: DemoVariant) => void
  stopDemo: () => void
  setStepIndex: (stepIndex: number) => void
  nextStep: (totalSteps: number) => void
  setVariant: (variant: DemoVariant) => void
}

export const useDemoStore = create<DemoState>()((set) => ({
  isActive: false,
  stepIndex: 0,
  variant: 'normal',
  startDemo: (variant = 'normal') => set({ isActive: true, stepIndex: 0, variant }),
  stopDemo: () => set({ isActive: false, stepIndex: 0 }),
  setStepIndex: (stepIndex) => set({ stepIndex }),
  setVariant: (variant) => set({ variant, stepIndex: 0 }),
  nextStep: (totalSteps) =>
    set((s) => ({
      stepIndex: totalSteps > 0 ? (s.stepIndex + 1) % totalSteps : 0,
    })),
}))
