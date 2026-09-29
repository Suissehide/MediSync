import type { PersistStorage } from 'zustand/middleware'
import { createJSONStorage } from 'zustand/middleware'

import { useAuthStore } from '@/store/useAuthStore.ts'
import type { TenantContext } from '@/types/auth.ts'

// Un store persiste qui porte des identifiants de service doit changer de
// tiroir avec le service, faute de quoi un retour dans un service affiche les
// filtres d'un autre. Sans service (ecrans d'administration) ou sans
// contexte du tout (avant authentification), un tiroir neutre : jamais celui
// d'un service.
export const scopedStorageName = (
  base: string,
  context: Pick<TenantContext, 'serviceId'> | null,
): string => `${base}/${context?.serviceId ?? '-'}`

// Le tiroir COURANT de chaque store scinde, porte par CE module plutot que
// derive du contexte a chaque acces.
//
// Le deriver a chaque acces (version precedente) ouvrait une fenetre d'un
// rendu : `useTenantQueryClient` bascule le contexte PENDANT le rendu, mais
// ne rehydrate que dans un effet du parent — qui s'execute APRES les effets
// des enfants. Toute ecriture programmee par un enfant dans cet intervalle
// (ex. le calendrier reinitialise ses dates de vue au montage) visait donc
// deja la cle du NOUVEAU service, avec la valeur encore en memoire vive de
// l'ANCIEN — la meme fuite que `resetOnTenantChange` referme pour son propre
// appel, rouverte ailleurs par une derivation trop permissive.
//
// En figeant la cle ici et en ne la faisant bouger que depuis
// `switchScopedStorageContext` (appelee par `rehydratePersistedStores`,
// `useTenantSwitch.ts`, dans la MEME instruction synchrone que chaque
// `*.persist.rehydrate()`), lecture et ecriture visent toujours le tiroir
// qui vient d'etre rehydrate — jamais un tiroir en avance sur la memoire
// vive du store.
const tiroirsCourants = new Map<string, string>()

const activerTiroir = (base: string, context: TenantContext | null): void => {
  tiroirsCourants.set(base, scopedStorageName(base, context))
}

// Filet, pas chemin nominal : un store scinde enregistre toujours sa cle des
// sa creation (`scopedStorage` ci-dessous). Ce repli ne joue que si cet ordre
// etait rompu — mieux vaut alors retomber sur le contexte courant qu'une cle
// indefinie.
const tiroirCourant = (base: string): string =>
  tiroirsCourants.get(base) ??
  scopedStorageName(base, useAuthStore.getState().context)

export const scopedStorage = <S>(
  base: string,
): PersistStorage<S> | undefined => {
  // Capture explicite, au chargement du module du store, du contexte
  // disponible a cet instant precis. Elle lit le bon tiroir (celui du
  // dernier service visite, pas le tiroir neutre) parce que `useAuthStore`
  // est importe plus haut dans ce fichier : son propre `persist`, adosse a
  // `localStorage`, est synchrone, donc deja rehydrate au moment ou ce
  // module finit d'etre evalue — et aucun cycle d'import ne fait revenir
  // `useAuthStore.ts` vers ce fichier pour compromettre cet ordre. C'est
  // cette meme garantie qui operait deja avant ce module, mais seulement de
  // facon tacite (l'ordre des imports, sans rien qui le dise) : elle est
  // desormais nommee, au seul endroit qui en depend.
  activerTiroir(base, useAuthStore.getState().context)

  return createJSONStorage<S>(() => ({
    getItem: (_key: string) => localStorage.getItem(tiroirCourant(base)),
    setItem: (_key: string, value: string) =>
      localStorage.setItem(tiroirCourant(base), value),
    removeItem: (_key: string) => localStorage.removeItem(tiroirCourant(base)),
  }))
}

// Fait basculer TOUS les tiroirs scindes vers le contexte courant, en une
// seule fois. A appeler juste avant les `*.persist.rehydrate()` qui suivent,
// jamais apres : c'est cet ordre-la qui ferme la fenetre decrite plus haut.
export const switchScopedStorageContext = (): void => {
  const context = useAuthStore.getState().context
  for (const base of tiroirsCourants.keys()) {
    activerTiroir(base, context)
  }
}
