import { createJSONStorage } from 'zustand/middleware'
import type { PersistStorage } from 'zustand/middleware'

import type { TenantContext } from '@/types/auth.ts'

import { useAuthStore } from '@/store/useAuthStore.ts'

// Un store persiste qui porte des identifiants de service doit changer de
// tiroir avec le service, faute de quoi un retour dans un service affiche les
// filtres d'un autre. Sans service (ecrans d'administration) ou sans
// contexte du tout (avant authentification), un tiroir neutre : jamais celui
// d'un service.
export const scopedStorageName = (
  base: string,
  context: Pick<TenantContext, 'serviceId'> | null,
): string => `${base}/${context?.serviceId ?? '-'}`

// Le nom est calcule a chaque acces, pas au chargement du module : le
// service n'est pas connu quand les modules sont importes. Extrait ici pour
// n'etre ecrit qu'une fois plutot que recopie dans les quatre stores
// persistes qui en ont besoin.
export const scopedStorage = <S>(base: string): PersistStorage<S> | undefined =>
  createJSONStorage<S>(() => ({
    getItem: (_key: string) =>
      localStorage.getItem(scopedStorageName(base, useAuthStore.getState().context)),
    setItem: (_key: string, value: string) =>
      localStorage.setItem(scopedStorageName(base, useAuthStore.getState().context), value),
    removeItem: (_key: string) =>
      localStorage.removeItem(scopedStorageName(base, useAuthStore.getState().context)),
  }))
