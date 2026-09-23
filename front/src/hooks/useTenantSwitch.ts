import type { QueryClient } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useAuthStore } from '@/store/useAuthStore.ts'
import { useDiagnosticStore } from '@/store/useDiagnosticStore.ts'
import { useDiagnosticTemplateStore } from '@/store/useDiagnosticTemplateStore.ts'
import { usePathwayTemplateEditStore } from '@/store/usePathwayTemplateEditStore.ts'

// Les cles de requete ne portent aucun prefixe de tenant, sur quatre-vingts
// appels. Les prefixer toutes serait quatre-vingts occasions d'en oublier une,
// et une seule suffit a montrer les patients d'un service dans un autre. On
// vide donc le cache en entier : un seul point d'application, impossible a
// appliquer a moitie. Le prix est un rechargement complet a chaque changement
// de contexte — une operation rare.
export const resetOnTenantChange = async (queryClient: QueryClient): Promise<void> => {
  // L'annulation precede le vidage : sans elle, une reponse en vol
  // reecrirait dans le cache qu'on vient de vider.
  await queryClient.cancelQueries()
  queryClient.clear()

  // Memoire vive hors cache : les selections et editions en cours, qui ne
  // veulent rien dire dans un autre service.
  useDiagnosticStore.getState().reset()
  useDiagnosticTemplateStore.getState().reset()
  usePathwayTemplateEditStore.getState().reset()
}

// Identifie le couple etablissement/service d'un contexte. Le separateur est
// toujours present, donc « pas de service » (`e1/`) ne peut pas etre confondu
// avec un service reel : aucun identifiant n'est vide. Et l'absence complete
// de contexte (chaine vide) reste distincte des deux.
const tenantKey = (context: { establishmentId: string; serviceId: string | null } | null): string =>
  context === null ? '' : `${context.establishmentId}/${context.serviceId ?? ''}`

// Monte une seule fois, sous le fournisseur de requetes. Compare le couple et
// non l'objet : le store reecrit un contexte equivalent a chaque navigation
// dans le meme service, ce qui viderait le cache a chaque page.
export const useTenantSwitch = (): void => {
  const queryClient = useQueryClient()
  const context = useAuthStore((state) => state.context)
  const key = tenantKey(context)
  const previous = useRef<string | null>(null)

  useEffect(() => {
    if (previous.current !== null && previous.current !== key) {
      void resetOnTenantChange(queryClient)
    }
    previous.current = key
  }, [key, queryClient])
}
