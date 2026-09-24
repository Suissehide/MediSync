import type { QueryKey } from '@tanstack/react-query'
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { TenantContext } from '@/types/auth.ts'

import { switchScopedStorageContext } from '@/store/scoped-storage.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import { useDashboardFilterStore } from '@/store/useDashboardFilterStore.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'
import { useDiagnosticTemplateStore } from '@/store/useDiagnosticTemplateStore.ts'
import { usePathwayTemplateEditStore } from '@/store/usePathwayTemplateEditStore.ts'
import { usePlanningStore } from '@/store/usePlanningStore.ts'
import { useSoignantStore } from '@/store/useSoignantStore.ts'
import { useTodoStore } from '@/store/useTodoStore.ts'

// Le client de requetes est construit ici, et non dans `main.tsx`, parce
// qu'il en faut un NEUF a chaque changement de contexte : les options doivent
// donc vivre dans une fabrique, pas dans une constante de module.
export const createTenantQueryClient = (): QueryClient =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error: unknown) => {
        console.error('Query cache: ', JSON.stringify(error))
      },
    }),
    mutationCache: new MutationCache({
      onError: (error: unknown) => {
        console.error('Mutation cache: ', JSON.stringify(error))
      },
    }),
  })

// Identifie le couple etablissement/service. Le separateur est toujours
// present, donc « pas de service » (`e1/`, sous le layout d'administration
// d'etablissement) ne peut pas etre confondu avec un service reel : aucun
// identifiant n'est vide. L'absence complete de contexte (chaine vide) reste
// distincte des deux.
export const tenantKey = (context: TenantContext | null): string =>
  context === null ? '' : `${context.establishmentId}/${context.serviceId ?? ''}`

// Lu a l'appel, jamais capture au chargement du module : sert aux ecritures
// differees, qui doivent renoncer si le contexte a change depuis qu'elles ont
// ete programmees.
export const currentTenantKey = (): string => tenantKey(useAuthStore.getState().context)

// Photo d'un ou plusieurs emplacements du cache, prise AVEC le couple du
// moment. Une mutation optimiste photographie l'etat avant de le modifier,
// puis le restaure si l'appel echoue.
//
// La donnee photographiee n'est pas un champ de cet objet : elle reste
// enfermee dans la fermeture, et `reposer` porte la garde de couple. Ni la
// reposer a la main, ni fabriquer une photo au couple menti ne sont donc
// possibles a partir de ce type — la garde ne s'oublie pas en recopiant le
// motif d'a cote.
export type TenantSnapshot = {
  readonly reposer: (client: QueryClient) => void
}

export const snapshotForTenant = (
  client: QueryClient,
  ...keys: QueryKey[]
): TenantSnapshot => {
  const tenant = currentTenantKey()
  // Seule lecture directe du cache autorisee dans le front avec celle de
  // `useSlot.ts` (cf. `src/test/lecture-directe-du-cache.test.ts`).
  const entries = keys.map((key) => ({ key, data: client.getQueryData(key) }))

  return {
    reposer: (target: QueryClient) => {
      if (tenant !== currentTenantKey()) {
        return
      }
      for (const { key, data } of entries) {
        target.setQueryData(key, data)
      }
    },
  }
}

// LE point d'application unique des restaurations. Il renonce si le couple a
// change depuis la prise de la photo.
//
// Pourquoi c'est necessaire alors qu'un client neuf est construit a chaque
// changement : une mutation DEJA EN VOL ne reste pas sur l'ancien client.
// React Query reassocie ses options des que le composant qui l'heberge rend
// une fois de plus avec le nouveau client (query-core,
// `mutationObserver.js` : `this.#currentMutation.setOptions(this.options)`
// quand la mutation est `pending`), et il lit `onError` AU MOMENT DU
// REGLEMENT, pas au depart (`mutation.js`). Le rappel est une fermeture
// recreee a chaque rendu sur le `queryClient` de ce rendu : la photo prise
// sur l'ancien client serait donc reecrite dans le NOUVEAU, et ce qui
// reapparait n'est pas une ligne mais la liste entiere du service precedent,
// sous une cle que le nouveau service lit.
//
// Ce qui tient cette garantie, exactement : le type ci-dessus ferme les
// contournements par la photo (la donnee est hors d'atteinte, le couple n'est
// pas falsifiable), et `src/test/lecture-directe-du-cache.test.ts` ferme le
// contournement qui reste — prendre sa propre photo par `getQueryData` puis
// la reposer sans passer par ici. Ce n'est donc PAS le compilateur qui
// l'empeche partout : c'est une regle de depot, et la voila nommee. Une
// affirmation fausse sur un mecanisme de surete vaut moins que pas
// d'affirmation du tout.
export const restoreForTenant = (
  client: QueryClient,
  snapshot: TenantSnapshot | undefined,
): void => {
  snapshot?.reposer(client)
}

// Les cinq stores qui tiennent en memoire vive de la donnee du service : deux
// selections, une edition en cours, et surtout deux MIROIRS de donnees du
// service (`soignants`, `todos`). Ces deux-la sont exclus de leur
// `partialize`, donc hors de portee d'une rehydratation de stores persistes,
// et six composants les affichent : sans cette remise a zero, les noms des
// soignants et les taches du service precedent restent a l'ecran, sans limite
// de temps sur un ecran qui ne remonte pas sa requete.
export const resetTenantStores = (): void => {
  useDiagnosticStore.getState().reset()
  useDiagnosticTemplateStore.getState().reset()
  usePathwayTemplateEditStore.getState().reset()
  useSoignantStore.getState().reset()
  useTodoStore.getState().reset()
}

// Les quatre stores persistes indexes par service (`scoped-storage.ts`) :
// leur tiroir change de nom avec le contexte, mais `zustand/persist` ne relit
// le disque qu'au chargement du module. Sans cet appel explicite, un store
// continuerait d'ecrire dans le nouveau tiroir tout en gardant en memoire les
// valeurs de l'ancien.
//
// `switchScopedStorageContext()` PUIS les `rehydrate()`, dans cette
// instruction : le tiroir de chaque store scinde ne bouge qu'ici, donc rien
// entre-temps (aucune ecriture programmee ailleurs, entre le rendu qui
// bascule le contexte et cet appel) ne peut viser le tiroir du nouveau
// service avec une valeur qui n'en vient pas — cf. le commentaire de
// `scoped-storage.ts`.
//
// Appelee au meme moment synchrone que `resetTenantStores`, pour la meme
// raison : un miroir ou un filtre remis a jour apres une frontiere
// asynchrone peut arriver apres la reponse du nouveau service et l'effacer a
// l'ecran.
export const rehydratePersistedStores = (): void => {
  switchScopedStorageContext()
  useSoignantStore.persist.rehydrate()
  useDashboardFilterStore.persist.rehydrate()
  useTodoStore.persist.rehydrate()
  usePlanningStore.persist.rehydrate()
}

// Appelee sur l'ancien client, une fois qu'il a ete remplace. Le vidage seul
// ne suffisait pas — quatre chemins d'ecriture differee le contournaient —
// mais il reste utile : il garantit que plus rien de l'ancien service n'est
// lisible, y compris par un observateur qui serait reste abonne a ce client.
export const resetOnTenantChange = async (previousClient: QueryClient): Promise<void> => {
  // La rehydratation AVANT la reinitialisation, et les deux avant toute
  // attente, de facon synchrone.
  //
  // L'ordre n'est pas arbitraire. `useSoignantStore` et `useTodoStore` sont a
  // la fois reinitialises (leur miroir) et persistes (une autre part de leur
  // etat) : leur `reset()` passe par le `set` enveloppe par `persist`, qui
  // persiste l'INTEGRALITE de l'etat courant apres chaque ecriture — y
  // compris la part persistee, inchangee par `reset()`. Reinitialiser
  // d'abord ecrirait donc, sous la cle du NOUVEAU service, la valeur encore
  // en memoire vive de l'ANCIEN — exactement la fuite que l'indexation existe
  // pour ecarter. Rehydrater d'abord met cette valeur a jour AVANT cette
  // ecriture, qui persiste alors un etat deja correct.
  rehydratePersistedStores()

  // Les miroirs sont realimentes par un effet des que la requete du nouveau
  // service revient : remis a zero apres une frontiere asynchrone, un miroir
  // fraichement rempli serait vide, et l'effet ne se rejouerait pas (la
  // donnee de requete n'a pas change) — l'utilisateur resterait devant une
  // liste vide.
  resetTenantStores()

  // L'annulation precede le vidage : sans elle, une reponse en vol
  // reecrirait dans le cache qu'on vient de vider. Elle evite aussi de
  // laisser courir des requetes reseau devenues inutiles.
  await previousClient.cancelQueries()
  previousClient.clear()
}

type CurrentClient = {
  key: string
  client: QueryClient
  previous: QueryClient | null
}

// Un client de requetes PAR COUPLE etablissement/service. Vider le cache ne
// suffisait pas : les annulations optimistes de mutations, la suppression
// differee de cinq secondes et toute reponse en retard reecrivent APRES le
// vidage, et ce qui reapparait est une liste entiere du service precedent
// sous une cle que le nouveau service lit. Avec un client neuf, ces ecritures
// atteignent l'ancien client, devenu inerte : aucune d'elles n'a besoin de
// connaitre le mecanisme, ce qui est la seule facon de n'en oublier aucune.
//
// Le nouveau client est adopte PENDANT LE RENDU, et non dans un effet : les
// URL d'API sont calculees a l'appel depuis le contexte courant, donc un seul
// rendu des enfants avec le nouveau contexte et l'ancien client suffirait a
// ranger la reponse du nouveau service dans le cache de l'ancien.
//
// CE HOOK NE FAIT QUE LA MOITIE DU TRAVAIL, et ne peut pas faire l'autre.
// Construire un client neuf ne REBRANCHE personne : React Query lie
// l'observateur au client a la construction et ne le relie jamais. Un ecran
// qui n'est pas DEMONTE garde donc l'observateur de l'ancien client et
// continue d'afficher le service precedent — sans meme emettre de requete,
// puisque les cles ne portent pas le tenant (D2). Le demontage est porte
// ailleurs, par le `remountDeps: ({ params }) => params` des deux layouts de
// tenant (`routes/_authenticated/e/$establishmentId/s/$serviceId.tsx` et
// `.../admin.tsx`). Les deux moities sont tenues ensemble par
// `routes/_authenticated/e/$establishmentId/remontage.test.tsx` ; les tests
// de ce fichier-ci ne verifient que les pieces.
export const useTenantQueryClient = (initialClient: QueryClient): QueryClient => {
  const context = useAuthStore((state) => state.context)
  const key = tenantKey(context)

  const [current, setCurrent] = useState<CurrentClient>(() => ({
    key,
    client: initialClient,
    previous: null,
  }))

  if (current.key !== key) {
    // Forme fonctionnelle : en mode strict React rend deux fois, et la
    // seconde passe recoit l'etat deja ajuste — sans elle, un second client
    // serait construit pour rien.
    setCurrent((previousState) =>
      previousState.key === key
        ? previousState
        : { key, client: createTenantQueryClient(), previous: previousState.client },
    )
  }

  useEffect(() => {
    if (current.previous) {
      void resetOnTenantChange(current.previous)
    }
  }, [current])

  return current.client
}
