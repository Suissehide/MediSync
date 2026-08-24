import type { QueryClient, QueryKey } from '@tanstack/react-query'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { SlotApi } from '../api/slot.api.ts'
import { SLOT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateSlotParams,
  Slot,
  SlotDateRange,
  UpdateSlotParams,
} from '../types/slot.ts'

// * QUERIES

export const useAllSlotsQuery = () => {
  const {
    data: slots,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SLOT.GET_ALL],
    queryFn: () => SlotApi.getAll(),
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { slots, isPending, isError, error }
}

/**
 * Ne charge que les créneaux chevauchant la fenêtre affichée. La fenêtre est
 * dans la clé de cache : chaque semaine déjà visitée est resservie
 * instantanément, et `keepPreviousData` garde la semaine courante à l'écran
 * pendant le chargement de la suivante plutôt que de vider le calendrier.
 */
export const useSlotsInRangeQuery = (range: SlotDateRange | null) => {
  const {
    data: slots,
    isPending,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: [SLOT.GET_ALL, range?.from, range?.to],
    queryFn: () => SlotApi.getAll(range ?? undefined),
    enabled: !!range,
    placeholderData: keepPreviousData,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { slots, isPending, isFetching, isError, error }
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

/**
 * Les créneaux sont cachés par fenêtre de dates ([SLOT.GET_ALL, from, to]), en
 * plus de la liste complète ([SLOT.GET_ALL]). Une mise à jour optimiste doit
 * donc toucher toutes les fenêtres déjà chargées, pas la seule clé nue.
 */
const snapshotSlotCaches = (queryClient: QueryClient) =>
  queryClient.getQueriesData<Slot[]>({ queryKey: [SLOT.GET_ALL] })

const updateSlotCaches = (
  queryClient: QueryClient,
  updater: (slots: Slot[] | undefined) => Slot[] | undefined,
) => {
  queryClient.setQueriesData<Slot[]>({ queryKey: [SLOT.GET_ALL] }, updater)
}

const restoreSlotCaches = (
  queryClient: QueryClient,
  snapshot: [QueryKey, Slot[] | undefined][] | undefined,
) => {
  for (const [queryKey, slots] of snapshot ?? []) {
    queryClient.setQueryData(queryKey, slots)
  }
}

export const useSlotMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createSlot = useMutation({
    mutationKey: [SLOT.CREATE],
    mutationFn: SlotApi.create,
    onMutate: async (newSlot: CreateSlotParams) => {
      await queryClient.cancelQueries({ queryKey: [SLOT.GET_ALL] })

      const previousSlots = snapshotSlotCaches(queryClient)
      updateSlotCaches(queryClient, (oldSlots) => [
        ...(oldSlots ?? []),
        newSlot as unknown as Slot,
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
      restoreSlotCaches(queryClient, context?.previousSlots)

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

      const previousSlots = snapshotSlotCaches(queryClient)
      updateSlotCaches(queryClient, (oldSlots) =>
        oldSlots?.filter((slot) => slot.id !== slotID),
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
      restoreSlotCaches(queryClient, context?.previousSlots)

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
      const previousSlots = snapshotSlotCaches(queryClient)
      updateSlotCaches(queryClient, (oldSlots) =>
        oldSlots?.map((slot) =>
          slot.id === updatedSlot.id
            ? {
                ...slot,
                ...updatedSlot,
                // updatedSlot.slotTemplate est partiel : on le fusionne au
                // lieu de l'écraser, sinon soignants et thématique sautent.
                slotTemplate: {
                  ...slot.slotTemplate,
                  ...updatedSlot.slotTemplate,
                },
              }
            : slot,
        ),
      )

      await queryClient.cancelQueries({ queryKey: [SLOT.GET_BY_ID] })
      const previousSlot = queryClient.getQueryData([SLOT.GET_BY_ID])
      queryClient.setQueryData(
        [SLOT.GET_BY_ID, updatedSlot.id],
        (oldSlot: Slot) => {
          if (!oldSlot) {
            return undefined
          }
          if (!oldSlot.slotTemplate) {
            return { ...oldSlot, ...updatedSlot }
          }
          return {
            ...oldSlot,
            ...updatedSlot,
            slotTemplate: {
              ...oldSlot.slotTemplate,
              ...updatedSlot.slotTemplate,
              soignants: oldSlot.slotTemplate.soignants,
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
      restoreSlotCaches(queryClient, context?.previousSlots)
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
