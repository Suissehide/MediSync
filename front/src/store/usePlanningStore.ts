import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PlanningState {
  currentDate: string
  viewStart: string
  viewEnd: string
}

interface PlanningActions {
  setPlanningDates: (dates: {
    currentDate: string
    viewStart: string
    viewEnd: string
  }) => void
}

export const usePlanningStore = create<PlanningState & PlanningActions>()(
  persist(
    (set) => ({
      currentDate: '',
      viewStart: '',
      viewEnd: '',

      setPlanningDates: ({ currentDate, viewStart, viewEnd }) =>
        set(() => ({ currentDate, viewStart, viewEnd })),
    }),
    {
      name: 'planning-storage',
    },
  ),
)
