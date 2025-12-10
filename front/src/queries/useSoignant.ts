import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { SoignantApi } from '../api/soignant.api.ts'
import { SOIGNANT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
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

// * MUTATIONS

export const useSoignantMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createSoignant = useMutation({
    mutationKey: [SOIGNANT.CREATE],
    mutationFn: SoignantApi.create,
    onMutate: async (newSoignant: CreateSoignantParams) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = queryClient.getQueryData([SOIGNANT.GET_ALL])
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
      queryClient.setQueryData([SOIGNANT.GET_ALL], context?.previousSoignants)

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

  const deleteSoignant = useMutation({
    mutationKey: [SOIGNANT.DELETE],
    mutationFn: SoignantApi.delete,
    onMutate: async (soignantID) => {
      await queryClient.cancelQueries({ queryKey: [SOIGNANT.GET_ALL] })

      const previousSoignants = queryClient.getQueryData([SOIGNANT.GET_ALL])
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
      queryClient.setQueryData([SOIGNANT.GET_ALL], context?.previousSoignants)

      toast({
        title: 'Erreur lors de la suppression du soignant',
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

      const previousSoignants = queryClient.getQueryData([SOIGNANT.GET_ALL])
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
      queryClient.setQueryData([SOIGNANT.GET_ALL], context?.previousSoignants)

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

  return { createSoignant, deleteSoignant, updateSoignant }
}
