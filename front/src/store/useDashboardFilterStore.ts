import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { scopedStorage } from './scoped-storage.ts'

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

type PersistedDashboardFilterState = Pick<
  DashboardFilterState,
  'mode' | 'selectedPathwayTemplateIDs'
>

// Narrowing sans assertion de type : `in` sur un `unknown` deja ramene a
// `object` restreint l'acces aux proprietes testees (TS 4.9+).
const estEtatFiltrePersiste = (
  valeur: unknown,
): valeur is PersistedDashboardFilterState =>
  typeof valeur === 'object' &&
  valeur !== null &&
  'mode' in valeur &&
  (valeur.mode === 'soignant' || valeur.mode === 'pathway') &&
  'selectedPathwayTemplateIDs' in valeur &&
  Array.isArray(valeur.selectedPathwayTemplateIDs)

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
          selectedPathwayTemplateIDs: state.selectedPathwayTemplateIDs.includes(
            id,
          )
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
      storage: scopedStorage('dashboard-filter-store'),
      // Le tiroir neuf d'un service jamais visite ne contient rien : sans ce
      // repli explicite, la fusion par defaut de zustand garderait le mode et
      // la selection encore en memoire vive du service precedent au lieu de
      // repartir sur les valeurs par defaut.
      merge: (persisted, current) => ({
        ...current,
        mode: estEtatFiltrePersiste(persisted) ? persisted.mode : 'soignant',
        selectedPathwayTemplateIDs: estEtatFiltrePersiste(persisted)
          ? persisted.selectedPathwayTemplateIDs
          : [],
      }),
    },
  ),
)
