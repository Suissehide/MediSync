import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { renameCurrentEstablishment, ServicesApi } from '@/api/services.api.ts'
import { SERVICE_ADMIN } from '@/constants/process.constant.ts'
import { TOAST_SEVERITY } from '@/constants/ui.constant.ts'
import { useDataFetching } from '@/hooks/useDataFetching.ts'
import { useToast } from '@/hooks/useToast.ts'
import { meQueryOptions } from '@/queries/useMe.ts'
import { useAuthStore } from '@/store/useAuthStore.ts'
import type { CreateServiceInput, UpdateServiceInput } from '@/types/service.ts'

// * QUERIES

export const useServicesQuery = () => {
  const {
    data: services,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SERVICE_ADMIN.GET_ALL],
    queryFn: ServicesApi.getAll,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { services, isPending, error }
}

// * MUTATIONS

export const useServiceMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [SERVICE_ADMIN.GET_ALL] })

  const createService = useMutation({
    mutationKey: [SERVICE_ADMIN.CREATE],
    mutationFn: (input: CreateServiceInput) => ServicesApi.create(input),
    onSuccess: () => {
      toast({ title: 'Service créé', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la création du service',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  // Une seule mutation pour renommer ET (dés/ré)activer, comme la route
  // qu'elle appelle (`ServicesApi.update`) : le message de confirmation
  // dépend de CE QUE la variable envoyée demandait, pas d'une clé séparée.
  const updateService = useMutation({
    mutationKey: [SERVICE_ADMIN.UPDATE],
    mutationFn: (input: UpdateServiceInput) => ServicesApi.update(input),
    onSuccess: (_service, variables) => {
      const title =
        variables.deactivated === true
          ? 'Service désactivé'
          : variables.deactivated === false
            ? 'Service réactivé'
            : 'Service renommé'
      toast({ title, severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la modification du service',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => invalidate(),
  })

  return { createService, updateService }
}

// Compteurs d'impact d'une désactivation (arbitrage transmis par Léo,
// task-13-brief.md) : une MUTATION, jamais une requête liée au montage de
// l'écran — appelée uniquement au moment où l'on s'apprête à désactiver un
// service précis, jamais pour toute la liste.
export const useServiceDeactivationImpact = () => {
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SERVICE_ADMIN.DEACTIVATION_IMPACT],
    mutationFn: (id: string) => ServicesApi.impactDesactivation(id),
    onError: (error) => {
      toast({
        title: "Impossible de calculer l'impact de la désactivation",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
}

// Le nom de l'établissement vient de `/me` (bandeau, sélecteur) : on le relit frais puis on
// le repose dans le store, sans toucher au contexte courant.
export const useRenameEstablishment = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationKey: [SERVICE_ADMIN.RENAME_ESTABLISHMENT],
    mutationFn: ({ name }: { id: string; name: string }) =>
      renameCurrentEstablishment(name),
    onSuccess: async () => {
      toast({
        title: 'Établissement renommé',
        severity: TOAST_SEVERITY.SUCCESS,
      })
      const user = await queryClient.fetchQuery({
        ...meQueryOptions,
        staleTime: 0,
      })
      useAuthStore.getState().update(user)
    },
    onError: (error) => {
      toast({
        title: "Erreur lors du renommage de l'établissement",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })
}
