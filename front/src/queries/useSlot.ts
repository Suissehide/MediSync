import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { SlotApi } from '../api/slot.api.ts'
import { SLOT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { CreateSlotParams, Slot, UpdateSlotParams } from '../types/slot.ts'

// * QUERIES

export const useAllSlotsQuery = () => {
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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { slots, isPending, isError, error }
}

export const useSlotByIDQuery = (slotID: string, options = {}) => {
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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { slot, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useSlotMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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
    onSuccess: () => {
      toast({
        title: 'Créneau créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([SLOT.GET_ALL], context?.previousSlots)

      toast({
        title: 'Erreur lors de la création du créneau',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
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
    onSuccess: () => {
      toast({
        title: 'Créneau supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([SLOT.GET_ALL], context?.previousSlots)

      toast({
        title: 'Erreur lors de la suppression du créneau',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
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

      await queryClient.cancelQueries({ queryKey: [SLOT.GET_BY_ID] })
      const previousSlot = queryClient.getQueryData([SLOT.GET_BY_ID])
      queryClient.setQueryData(
        [SLOT.GET_BY_ID, updatedSlot.id],
        (oldSlot: Slot) => {
          if (!oldSlot) {
            return updatedSlot
          }
          return {
            ...oldSlot,
            slotTemplate: {
              ...oldSlot.slotTemplate,
              ...updatedSlot.slotTemplate,
              soignant: oldSlot.slotTemplate.soignant,
            },
          }
        },
      )

      return { previousSlots, previousSlot }
    },
    onSuccess: () => {
      toast({
        title: 'Créneau modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([SLOT.GET_ALL], context?.previousSlots)
      queryClient.setQueryData([SLOT.GET_BY_ID], context?.previousSlot)

      toast({
        title: 'Erreur lors de la mise à jour du créneau',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_BY_ID] })
    },
  })

  return { createSlot, deleteSlot, updateSlot }
}
