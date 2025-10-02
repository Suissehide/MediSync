import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { SOIGNANT } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { SoignantApi } from '../api/soignant.ts'
import type {
  CreateSoignantParams,
  Soignant,
  UpdateSoignantParams,
} from '../types/soignant.ts'
import { useEffect } from 'react'
import { useSoignantStore } from '../store/useSoignantStore.ts'

// * QUERIES

export const useSoignantQueries = () => {
  const setSoignants = useSoignantStore((state) => state.setSoignants)

  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING
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

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { soignants, isPending, error }
}

// * MUTATIONS

export const useSoignantMutations = () => {
  const queryClient = useQueryClient()

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
    onError: (_, __, context) => {
      queryClient.setQueryData([SOIGNANT.GET_ALL], context?.previousSoignants)
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
    onError: (_, __, context) => {
      queryClient.setQueryData([SOIGNANT.GET_ALL], context?.previousSoignants)
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
    onError: (_, __, context) => {
      queryClient.setQueryData([SOIGNANT.GET_ALL], context?.previousSoignants)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SOIGNANT.GET_ALL] })
    },
  })

  return { createSoignant, deleteSoignant, updateSoignant }
}
