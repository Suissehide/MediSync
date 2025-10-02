import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { SLOT } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { SlotApi } from '../api/slot.ts'
import type { CreateSlotParams, Slot, UpdateSlotParams } from '../types/slot.ts'

// * QUERIES

export const useAllSlotsQuery = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING

  const {
    data: slots,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SLOT.GET_ALL],
    queryFn: SlotApi.getAll,
    retry: 0,
  })

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { slots, isPending, isError, error }
}

export const useSlotByIDQuery = (slotID: string, options = {}) => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING

  const {
    data: slot,
    isPending,
    isError,
    error,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: [SLOT.GET_BY_ID, slotID],
    queryFn: () => SlotApi.getByID(slotID),
    enabled: !!slotID,
    retry: 0,
    ...options,
  })

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { slot, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useSlotMutations = () => {
  const queryClient = useQueryClient()

  const createSlot = useMutation({
    mutationKey: [SLOT.CREATE],
    mutationFn: SlotApi.create,
    onMutate: async (newSlot: CreateSlotParams) => {
      await queryClient.cancelQueries({ queryKey: [SLOT.GET_ALL] })

      const previousSlots = queryClient.getQueryData([SLOT.GET_ALL])
      queryClient.setQueryData([SLOT.GET_ALL], (oldSlots: Slot[]) => [
        ...(oldSlots || []),
        newSlot,
      ])

      return { previousSlots }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([SLOT.GET_ALL], context?.previousSlots)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
    },
  })

  const deleteSlot = useMutation({
    mutationKey: [SLOT.DELETE],
    mutationFn: SlotApi.delete,
    onMutate: async (slotID) => {
      await queryClient.cancelQueries({ queryKey: [SLOT.GET_ALL] })

      const previousSlots = queryClient.getQueryData([SLOT.GET_ALL])
      queryClient.setQueryData([SLOT.GET_ALL], (oldSlots: Slot[]) =>
        oldSlots?.filter((slot: Slot) => slot.id !== slotID),
      )

      return { previousSlots }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([SLOT.GET_ALL], context?.previousSlots)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
    },
  })

  const updateSlot = useMutation({
    mutationKey: [SLOT.UPDATE],
    mutationFn: SlotApi.update,
    onMutate: async (updatedSlot: UpdateSlotParams) => {
      await queryClient.cancelQueries({ queryKey: [SLOT.GET_ALL] })

      const previousSlots = queryClient.getQueryData([SLOT.GET_ALL])
      queryClient.setQueryData([SLOT.GET_ALL], (oldSlots: Slot[]) =>
        oldSlots?.map((slot: Slot) =>
          slot.id === updatedSlot.id ? updatedSlot : slot,
        ),
      )

      return { previousSlots }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([SLOT.GET_ALL], context?.previousSlots)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
    },
  })

  useDataFetching({
    isPending: createSlot.isPending,
    isError: createSlot.isError,
    error: createSlot.error,
    errorMessage: 'Erreur lors de la création du créneau',
  })

  useDataFetching({
    isPending: updateSlot.isPending,
    isError: updateSlot.isError,
    error: updateSlot.error,
    errorMessage: 'Erreur lors de la modification du créneau',
  })

  useDataFetching({
    isPending: deleteSlot.isPending,
    isError: deleteSlot.isError,
    error: deleteSlot.error,
    errorMessage: 'Erreur lors de la suppression du créneau',
  })

  return { createSlot, deleteSlot, updateSlot }
}
