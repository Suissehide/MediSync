import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { SuperAdminApi } from '../api/superAdmin.api.ts'
import { SUPER_ADMIN } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { CreateEstablishmentInput, CreateGrantInput } from '../types/superAdmin.ts'

// Écrans du super-admin (tâche 12) : hors de tout tenant. Aucune clé de
// requête ici ne porte d'établissement ou de service au sens de
// front/CLAUDE.md (§ « Query keys deliberately do not carry the tenant »),
// et pour cause : ces écrans ne vivent sous AUCUN des deux layouts de
// tenant, donc `hooks/useTenantSwitch.ts` ne les distingue jamais les uns
// des autres — `tenantKey(null)` vaut la chaîne vide pour tout compte qui
// n'a jamais posé de contexte, quel que soit ce compte. Ce n'est PAS « un
// seul et même `QueryClient` » pour toujours (erreur corrigée ici, tour de
// correction 1, Important n°3) : ils vivent sous LE CLIENT DU COUPLE
// COURANT, qui peut très bien être celui d'un compte précédent si personne
// n'a changé de couple entre deux — par exemple deux super-admins qui se
// succèdent sans qu'aucun des deux ne visite jamais un écran de tenant.
// C'est pour cette raison précise que `useLogout` (`queries/useAuth.ts`)
// vide le cache actif à la déconnexion : la garantie ne vient pas d'un
// client dédié à cette zone, qui n'existe pas, mais d'un cache remis à zéro
// à chaque changement de compte.

// * QUERIES

export const useSuperAdminEstablishmentsQuery = () => {
  const {
    data: establishments,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SUPER_ADMIN.GET_ALL_ESTABLISHMENTS],
    queryFn: SuperAdminApi.listEstablishments,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { establishments, isPending, error }
}

// L'identifiant reçu en paramètre est la DONNÉE demandée (`GET
// /super-admin/establishments/:id`), pas un tenant implicite — voir
// l'exception déclarée dans conventions-tenant-api-queries.test.ts. Il
// figure dans la clé de requête pour la même raison qu'un `patientID` y
// figure sur une fiche patient : ce n'est pas le mécanisme de cloisonnement
// par tenant que garde `hooks/useTenantSwitch.ts` (un seul client sert tous
// ces écrans), seulement l'identité de la ressource demandée.
export const useSuperAdminEstablishmentQuery = (establishmentId: string) => {
  const {
    data: establishment,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SUPER_ADMIN.GET_ESTABLISHMENT, establishmentId],
    queryFn: () => SuperAdminApi.getEstablishment(establishmentId),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { establishment, isPending, error }
}

// * MUTATIONS

// Réintroduit à la tâche 14b (hors plan, étape 4a) — voir
// `api/superAdmin.api.ts`. LE JETON RENDU EST UN MOT DE PASSE À USAGE
// UNIQUE (même exigence que `useMemberMutations().createMemberAccount`,
// tâche 13) : cette mutation ne l'écrit dans AUCUNE clé de requête, AUCUN
// cache — son seul effet observable pour l'appelant est
// `createEstablishment.data`, tenu par React Query dans le cache des
// MUTATIONS (jamais atteignable par `getQueryData`/`getQueriesData`).
// `invalidate()` ne rafraîchit que la LISTE des établissements
// (`GET_ALL_ESTABLISHMENTS`), qui ne porte jamais le jeton en clair (voir
// `establishmentListItemSchema`, back : pas de champ `accessLink`).
export const useSuperAdminCreateEstablishment = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SUPER_ADMIN.CREATE_ESTABLISHMENT],
    mutationFn: (input: CreateEstablishmentInput) =>
      SuperAdminApi.createEstablishment(input),
    onSuccess: () => {
      toast({ title: 'Établissement créé', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de la création de l'établissement",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: [SUPER_ADMIN.GET_ALL_ESTABLISHMENTS],
      }),
  })
}

// Recherche déclenchée par un envoi de formulaire, pas par un montage
// d'écran : une mutation plutôt qu'une requête, comme le reste des actions
// ponctuelles de ce module — aucune clé de cache à invalider ou à
// réutiliser.
export const useSuperAdminAccountSearch = () => {
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SUPER_ADMIN.SEARCH_ACCOUNT],
    mutationFn: (email: string) => SuperAdminApi.searchAccount(email),
    onError: (error) => {
      toast({
        title: 'Compte introuvable',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
}

// LE JETON RENDU NE DOIT JAMAIS ATTERRIR AILLEURS QU'À L'ÉCRAN (brief
// tâche 12) : cette mutation ne l'écrit dans aucune clé de requête, aucun
// cache, aucune URL — son seul effet est de le renvoyer à l'appelant via
// `data`, tenu par React Query dans le cache des MUTATIONS (jamais
// atteignable par `getQueryData`/`getQueriesData`, qui ne lisent que le
// cache des requêtes). `users.tsx` l'affiche et rien de plus.
export const useSuperAdminReissueAccessLink = () => {
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SUPER_ADMIN.REISSUE_ACCESS_LINK],
    mutationFn: (userId: string) => SuperAdminApi.reissueAccessLink(userId),
    onError: (error) => {
      toast({
        title: 'Impossible de réémettre le lien',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
}

export const useSuperAdminCreateGrant = () => {
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SUPER_ADMIN.CREATE_GRANT],
    mutationFn: (input: CreateGrantInput) => SuperAdminApi.createGrant(input),
    onSuccess: () => {
      toast({ title: 'Octroi créé', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'octroi",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
}

export const useSuperAdminRevokeGrant = () => {
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SUPER_ADMIN.REVOKE_GRANT],
    mutationFn: (id: string) => SuperAdminApi.revokeGrant(id),
    onSuccess: () => {
      toast({ title: 'Octroi révoqué', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la révocation',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
}
