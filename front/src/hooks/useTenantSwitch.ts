import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { TenantContext } from '@/types/auth.ts'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'
import { useDiagnosticTemplateStore } from '@/store/useDiagnosticTemplateStore.ts'
import { usePathwayTemplateEditStore } from '@/store/usePathwayTemplateEditStore.ts'
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

// Appelee sur l'ancien client, une fois qu'il a ete remplace. Le vidage seul
// ne suffisait pas — quatre chemins d'ecriture differee le contournaient —
// mais il reste utile : il garantit que plus rien de l'ancien service n'est
// lisible, y compris par un observateur qui serait reste abonne a ce client.
export const resetOnTenantChange = async (previousClient: QueryClient): Promise<void> => {
  // L'annulation precede le vidage : sans elle, une reponse en vol
  // reecrirait dans le cache qu'on vient de vider. Elle evite aussi de
  // laisser courir des requetes reseau devenues inutiles.
  await previousClient.cancelQueries()
  previousClient.clear()

  resetTenantStores()
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
