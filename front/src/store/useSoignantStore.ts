import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Soignant } from '../types/soignant.ts'

interface SoignantState {
  soignants: Soignant[]
  selectedSoignantIDs: string[]
}

interface SoignantActions {
  setSoignants: (liste: Soignant[]) => void
  addSoignant: (soignant: Soignant) => void
  removeSoignant: (id: string) => void
  clearSoignants: () => void

  toggleSoignant: (id: string) => void
  unselectSoignant: () => void
}

type PersistedSoignantState = Pick<SoignantState, 'selectedSoignantIDs'>

export const useSoignantStore = create<SoignantState & SoignantActions>()(
  persist(
    (set) => ({
      soignants: [],
      selectedSoignantIDs: [],

      setSoignants: (liste) => set({ soignants: liste }),
      addSoignant: (soignant) =>
        set((state) => ({
          soignants: [...state.soignants, soignant],
        })),
      removeSoignant: (id) =>
        set((state) => ({
          soignants: state.soignants.filter((s) => s.id !== id),
          selectedSoignantIDs: state.selectedSoignantIDs.filter(
            (selectedID) => selectedID !== id,
          ),
        })),
      clearSoignants: () => set({ soignants: [], selectedSoignantIDs: [] }),

      toggleSoignant: (id) =>
        set((state) => ({
          selectedSoignantIDs: state.selectedSoignantIDs.includes(id)
            ? state.selectedSoignantIDs.filter((selectedID) => selectedID !== id)
            : [...state.selectedSoignantIDs, id],
        })),
      unselectSoignant: () => set({ selectedSoignantIDs: [] }),
    }),
    {
      name: 'soignant-store',
      partialize: (state): PersistedSoignantState => ({
        selectedSoignantIDs: state.selectedSoignantIDs,
      }),
    },
  ),
)
