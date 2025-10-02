import { create } from 'zustand'

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

export const usePlanningStore = create<PlanningState & PlanningActions>(
  (set) => ({
    currentDate: '',
    viewStart: '',
    viewEnd: '',

    setPlanningDates: ({ currentDate, viewStart, viewEnd }) =>
      set(() => ({ currentDate, viewStart, viewEnd })),
  }),
)
