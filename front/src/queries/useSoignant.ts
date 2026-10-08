import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { SoignantApi } from '../api/soignant.api.ts'
import { undoToastAction } from '../components/custom/undoToastAction.tsx'
import { SOIGNANT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import {
  restoreForTenant,
  snapshotForTenant,
} from '../hooks/useTenantSwitch.ts'
import { useToast } from '../hooks/useToast.ts'
import { useSoignantStore } from '../store/useSoignantStore.ts'
import type {
  CreateSoignantParams,
  Soignant,
  UpdateSoignantParams,
} from '../types/soignant.ts'

// * QUERIES

export const useSoignantQueries = (archived = false) => {
  const setSoignants = useSoignantStore((state) => state.setSoignants)

  const getAllSoignants = async () => {
    return await SoignantApi.getAll(undefined, archived)
  }
  const {
    data: soignants,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SOIGNANT.GET_ALL, archived],
    queryFn: getAllSoignants,
    retry: 0,
  })

  useEffect(() => {
    // Le store miroite la liste ACTIVE, celle que lisent le planning et les
    // formulaires : y verser les archivees les proposerait partout ailleurs.
    if (soignants && !archived) {
      setSoignants(soignants)
    }
  }, [setSoignants, soignants, archived])

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { soignants, isPending, error }
}

// * MUTATIONS

export const useSoignantMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createSoignant = useMutation({
    mutationKey: [SOIGNANT.CREATE],
    mutationFn: SoignantApi.create,
    onMutate: async (newSoignant: CreateSoignantParams) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = snapshotForTenant(queryClient, [
        SOIGNANT.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [SOIGNANT.GET_ALL, false],
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
      await queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] })
    },
  })

  const restoreSoignant = useMutation({
    mutationKey: [SOIGNANT.RESTORE],
    mutationFn: (soignantID: string) =>
      SoignantApi.update({ id: soignantID, archived: false }),
    onSuccess: () => {
      toast({ title: 'Soignant restauré', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la restauration du soignant',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] })
    },
  })

  const archiveSoignant = useMutation({
    mutationKey: [SOIGNANT.ARCHIVE],
    mutationFn: SoignantApi.archive,
    onMutate: async (soignantID: string) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = snapshotForTenant(queryClient, [
        SOIGNANT.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [SOIGNANT.GET_ALL, false],
        (oldSoignants: Soignant[]) =>
          oldSoignants?.filter(
            (soignant: Soignant) => soignant.id !== soignantID,
          ),
      )

      return { previousSoignants }
    },
    onSuccess: (_, soignantID) => {
      toast({
        title: 'Soignant archivé',
        message: 'Les créneaux et thématiques existants le conservent.',
        severity: TOAST_SEVERITY.SUCCESS,
        action: undoToastAction(() => restoreSoignant.mutate(soignantID)),
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousSoignants)

      toast({
        title: 'Erreur lors de l’archivage du soignant',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] })
    },
  })

  const updateSoignant = useMutation({
    mutationKey: [SOIGNANT.UPDATE],
    mutationFn: SoignantApi.update,
    onMutate: async (updatedSoignant: UpdateSoignantParams) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = snapshotForTenant(queryClient, [
        SOIGNANT.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [SOIGNANT.GET_ALL, false],
        (oldSoignants: Soignant[]) =>
          oldSoignants?.map((soignant: Soignant) =>
            soignant.id === updatedSoignant.id
              ? { ...soignant, ...updatedSoignant }
              : soignant,
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
      await queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] })
    },
  })

  // Suppression definitive, depuis la liste archivee. Le serveur refuse en 409
  // tant que quelque chose reference la ligne, et son message nomme quoi.
  const deleteForeverSoignant = useMutation({
    mutationKey: [SOIGNANT.DELETE_FOREVER],
    mutationFn: SoignantApi.deleteForever,
    onSuccess: () => {
      toast({
        title: 'Soignant supprimé définitivement',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Suppression impossible',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] })
    },
  })

  return {
    createSoignant,
    archiveSoignant,
    restoreSoignant,
    updateSoignant,
    deleteForeverSoignant,
  }
}
