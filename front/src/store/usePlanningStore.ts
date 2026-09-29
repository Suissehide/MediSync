import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { scopedStorage } from './scoped-storage.ts'

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

type PersistedPlanningState = PlanningState

// Narrowing sans assertion de type : `in` sur un `unknown` deja ramene a
// `object` restreint l'acces aux proprietes testees (TS 4.9+).
const estEtatPlanningPersiste = (
  valeur: unknown,
): valeur is PersistedPlanningState =>
  typeof valeur === 'object' &&
  valeur !== null &&
  'currentDate' in valeur &&
  typeof valeur.currentDate === 'string' &&
  'viewStart' in valeur &&
  typeof valeur.viewStart === 'string' &&
  'viewEnd' in valeur &&
  typeof valeur.viewEnd === 'string'

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
      storage: scopedStorage('planning-storage'),
      // Le tiroir neuf d'un service jamais visite ne contient rien : sans ce
      // repli explicite, la fusion par defaut de zustand garderait les dates
      // encore en memoire vive du service precedent au lieu de repartir sur
      // les valeurs par defaut.
      merge: (persisted, current) => ({
        ...current,
        currentDate: estEtatPlanningPersiste(persisted)
          ? persisted.currentDate
          : '',
        viewStart: estEtatPlanningPersiste(persisted)
          ? persisted.viewStart
          : '',
        viewEnd: estEtatPlanningPersiste(persisted) ? persisted.viewEnd : '',
      }),
    },
  ),
)
