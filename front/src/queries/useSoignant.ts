import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { SoignantApi } from '../api/soignant.api.ts'
import { SOIGNANT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import {
  restoreForTenant,
  snapshotForTenant,
} from '../hooks/useTenantSwitch.ts'
import { useSoignantStore } from '../store/useSoignantStore.ts'
import type {
  CreateSoignantParams,
  Soignant,
  UpdateSoignantParams,
} from '../types/soignant.ts'

// * QUERIES

export const useSoignantQueries = () => {
  const setSoignants = useSoignantStore((state) => state.setSoignants)

  const getAllSoignants = async () => {
    return await SoignantApi.getAll()
  }
  const {
    data: soignants,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SOIGNANT.GET_ALL],
    queryFn: getAllSoignants,
    retry: 0,
  })

  useEffect(() => {
    if (soignants) {
      setSoignants(soignants)
    }
  }, [setSoignants, soignants])

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { soignants, isPending, error }
}

// Même donnée que `useSoignantQueries`, mais lue par le préfixe
// d'établissement : à utiliser depuis un écran sans service en contexte
// (l'écran des membres, `admin/members.tsx`, et les formulaires qu'il
// ouvre), où `useSoignantQueries` échouerait (`tenantApiUrl` lève sans
// service). N'écrit pas dans `useSoignantStore` : ce store sert les filtres
// des écrans de service, hors du périmètre de cet écran d'administration.
export const useEstablishmentSoignantsQuery = () => {
  const {
    data: soignants,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SOIGNANT.GET_ALL_ESTABLISHMENT],
    queryFn: SoignantApi.getAllForEstablishment,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { soignants, isPending, error }
}

// * MUTATIONS

// Les deux listes — celle des ecrans de service et celle de l'administration
// d'etablissement — decrivent le meme ensemble (le depot filtre par etablissement,
// jamais par service) : une ecriture les rend perimees toutes les deux. Depuis la
// navigation par echelle, les ecritures partent de l'ecran d'administration, qui ne lit
// que la seconde.
const invalidateSoignantLists = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] }),
    queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL_ESTABLISHMENT] }),
  ])

export const useSoignantMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createSoignant = useMutation({
    mutationKey: [SOIGNANT.CREATE],
    mutationFn: SoignantApi.create,
    onMutate: async (newSoignant: CreateSoignantParams) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = snapshotForTenant(queryClient, [SOIGNANT.GET_ALL])
      queryClient.setQueryData(
        [SOIGNANT.GET_ALL],
        (oldSoignants: Soignant[]) => [...(oldSoignants || []), newSoignant],
      )

      return { previousSoignants }
    },
    onSuccess: () => {
      toast({
        title: 'Soignant créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousSoignants)

      toast({
        title: 'Erreur lors de la création du soignant',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await invalidateSoignantLists(queryClient)
    },
  })

  const deleteSoignant = useMutation({
    mutationKey: [SOIGNANT.DELETE],
    mutationFn: SoignantApi.delete,
    onMutate: async (soignantID) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = snapshotForTenant(queryClient, [SOIGNANT.GET_ALL])
      queryClient.setQueryData([SOIGNANT.GET_ALL], (oldSoignants: Soignant[]) =>
        oldSoignants?.filter(
          (soignant: Soignant) => soignant.id !== soignantID,
        ),
      )

      return { previousSoignants }
    },
    onSuccess: () => {
      toast({
        title: 'Soignant supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousSoignants)

      toast({
        title: 'Erreur lors de la suppression du soignant',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await invalidateSoignantLists(queryClient)
    },
  })

  const updateSoignant = useMutation({
    mutationKey: [SOIGNANT.UPDATE],
    mutationFn: SoignantApi.update,
    onMutate: async (updatedSoignant: UpdateSoignantParams) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = snapshotForTenant(queryClient, [SOIGNANT.GET_ALL])
      queryClient.setQueryData([SOIGNANT.GET_ALL], (oldSoignants: Soignant[]) =>
        oldSoignants?.map((soignant: Soignant) =>
          soignant.id === updatedSoignant.id ? updatedSoignant : soignant,
        ),
      )

      return { previousSoignants }
    },
    onSuccess: () => {
      toast({
        title: 'Soignant modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousSoignants)

      toast({
        title: 'Erreur lors de la mise à jour du soignant',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await invalidateSoignantLists(queryClient)
    },
  })

  return { createSoignant, deleteSoignant, updateSoignant }
}
