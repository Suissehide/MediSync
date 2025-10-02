import type { Soignant } from '../types/soignant.ts'
import { persist } from 'zustand/middleware'
import { create } from 'zustand'

interface SoignantState {
  soignants: Soignant[]
  selectedSoignantID: string | null
}

interface SoignantActions {
  setSoignants: (liste: Soignant[]) => void
  addSoignant: (soignant: Soignant) => void
  removeSoignant: (id: string) => void
  clearSoignants: () => void

  selectSoignant: (id: string) => void
  unselectSoignant: () => void
}

type PersistedSoignantState = Pick<SoignantState, 'selectedSoignantID'>

const soignants: Soignant[] = [
  { id: '1', name: 'Educ IDE', active: true },
  { id: '2', name: 'Psychologue', active: true },
  { id: '3', name: 'Pharmacienne', active: true },
  { id: '4', name: 'Aide-soignante', active: true },
  { id: '5', name: 'Diététicienne', active: true },
]

export const useSoignantStore = create<SoignantState & SoignantActions>()(
  persist(
    (set) => ({
      soignants: [],
      selectedSoignantID: null,

      setSoignants: (liste) => set({ soignants: liste }),
      addSoignant: (soignant) =>
        set((state) => ({
          soignants: [...state.soignants, soignant],
        })),
      removeSoignant: (id) =>
        set((state) => ({
          soignants: state.soignants.filter((s) => s.id !== id),
          selectedSoignantID:
            state.selectedSoignantID === id ? null : state.selectedSoignantID,
        })),
      clearSoignants: () => set({ soignants: [], selectedSoignantID: null }),

      selectSoignant: (id) => set({ selectedSoignantID: id }),
      unselectSoignant: () => set({ selectedSoignantID: null }),
    }),
    {
      name: 'soignant-store',
      partialize: (state): PersistedSoignantState => ({
        selectedSoignantID: state.selectedSoignantID,
      }),
    },
  ),
)
