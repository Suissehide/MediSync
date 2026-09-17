import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DashboardFilterMode = 'soignant' | 'pathway'

interface DashboardFilterState {
  mode: DashboardFilterMode
  selectedPathwayTemplateIDs: string[]
}

interface DashboardFilterActions {
  setMode: (mode: DashboardFilterMode) => void

  togglePathwayTemplate: (id: string) => void
  selectAllPathwayTemplates: (ids: string[]) => void
  unselectPathwayTemplates: () => void
}

export const useDashboardFilterStore = create<
  DashboardFilterState & DashboardFilterActions
>()(
  persist(
    (set) => ({
      mode: 'soignant',
      selectedPathwayTemplateIDs: [],

      setMode: (mode) => set({ mode }),

      togglePathwayTemplate: (id) =>
        set((state) => ({
          selectedPathwayTemplateIDs:
            state.selectedPathwayTemplateIDs.includes(id)
              ? state.selectedPathwayTemplateIDs.filter(
                  (selectedID) => selectedID !== id,
                )
              : [...state.selectedPathwayTemplateIDs, id],
        })),
      selectAllPathwayTemplates: (ids) =>
        set({ selectedPathwayTemplateIDs: ids }),
      unselectPathwayTemplates: () => set({ selectedPathwayTemplateIDs: [] }),
    }),
    {
      name: 'dashboard-filter-store',
    },
  ),
)
