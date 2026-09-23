import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { Soignant } from '../types/soignant.ts'

import { scopedStorage } from './scoped-storage.ts'

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
  selectAllSoignants: () => void
  unselectSoignant: () => void

  reset: () => void
}

type PersistedSoignantState = Pick<SoignantState, 'selectedSoignantIDs'>

// Narrowing sans assertion de type : `in` sur un `unknown` deja ramene a
// `object` restreint l'acces a la propriete testee (TS 4.9+).
const estEtatSoignantPersiste = (valeur: unknown): valeur is PersistedSoignantState =>
  typeof valeur === 'object' &&
  valeur !== null &&
  'selectedSoignantIDs' in valeur &&
  Array.isArray(valeur.selectedSoignantIDs)

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
      selectAllSoignants: () =>
        set((state) => ({
          selectedSoignantIDs: state.soignants.map((s) => s.id),
        })),
      unselectSoignant: () => set({ selectedSoignantIDs: [] }),

      // Appelee au changement de contexte. `soignants` est un miroir en
      // memoire de la donnee du service, affiche par plusieurs ecrans et
      // exclu du `partialize` : rien d'autre ne le remet a zero.
      //
      // `selectedSoignantIDs` n'est plus touche ici : il est indexe par
      // service (persist/storage plus bas) et rehydrate au changement de
      // contexte (`useTenantSwitch.ts`). Le reinitialiser ici en plus serait
      // redondant avec l'indexation, qui suffit deja a ecarter la selection
      // d'un autre service.
      reset: () => set({ soignants: [] }),
    }),
    {
      name: 'soignant-store',
      storage: scopedStorage('soignant-store'),
      partialize: (state): PersistedSoignantState => ({
        selectedSoignantIDs: state.selectedSoignantIDs,
      }),
      // Le tiroir neuf d'un service jamais visite ne contient rien : sans ce
      // repli explicite, la fusion par defaut de zustand garderait la
      // selection encore en memoire vive du service precedent au lieu de
      // repartir vide.
      merge: (persisted, current) => ({
        ...current,
        selectedSoignantIDs: estEtatSoignantPersiste(persisted)
          ? persisted.selectedSoignantIDs
          : [],
      }),
    },
  ),
)
