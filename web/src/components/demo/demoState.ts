import { create } from 'zustand'

export interface DemoState {
  isActive: boolean
  stepIndex: number
  startDemo: () => void
  stopDemo: () => void
  setStepIndex: (stepIndex: number) => void
  nextStep: (totalSteps: number) => void
}

export const useDemoStore = create<DemoState>()((set) => ({
  isActive: false,
  stepIndex: 0,
  startDemo: () => set({ isActive: true, stepIndex: 0 }),
  stopDemo: () => set({ isActive: false, stepIndex: 0 }),
  setStepIndex: (stepIndex) => set({ stepIndex }),
  nextStep: (totalSteps) =>
    set((s) => ({
      stepIndex: totalSteps > 0 ? (s.stepIndex + 1) % totalSteps : 0,
    })),
}))
