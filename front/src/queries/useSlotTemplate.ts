import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { SLOT_TEMPLATE } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { SlotTemplateApi } from '../api/slotTemplate.ts'
import type {
  CreateSlotTemplateParams,
  SlotTemplate,
  UpdateSlotTemplateParams,
} from '../types/slotTemplate.ts'

// * QUERIES

export const useSlotTemplateQueries = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING
  const getAllSlotTemplates = async () => {
    return await SlotTemplateApi.getAll()
  }
  const {
    data: slotTemplates,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SLOT_TEMPLATE.GET_ALL],
    queryFn: getAllSlotTemplates,
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

  return { slotTemplates, isPending, error }
}

// * MUTATIONS

export const useSlotTemplateMutations = () => {
  const queryClient = useQueryClient()

  const createSlotTemplate = useMutation({
    mutationKey: [SLOT_TEMPLATE.CREATE],
    mutationFn: SlotTemplateApi.create,
    onMutate: async (newSlotTemplate: CreateSlotTemplateParams) => {
      await queryClient.cancelQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })

      const previousSlotTemplates = queryClient.getQueryData([
        SLOT_TEMPLATE.GET_ALL,
      ])
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        (oldSlotTemplates: SlotTemplate[]) => [
          ...(oldSlotTemplates || []),
          newSlotTemplate,
        ],
      )

      return { previousSlotTemplates }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        context?.previousSlotTemplates,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })
    },
  })

  const deleteSlotTemplate = useMutation({
    mutationKey: [SLOT_TEMPLATE.DELETE],
    mutationFn: SlotTemplateApi.delete,
    onMutate: async (slotTemplateID) => {
      await queryClient.cancelQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })

      const previousSlotTemplates = queryClient.getQueryData([
        SLOT_TEMPLATE.GET_ALL,
      ])
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        (oldSlotTemplates: SlotTemplate[]) =>
          oldSlotTemplates?.filter(
            (slotTemplate: SlotTemplate) => slotTemplate.id !== slotTemplateID,
          ),
      )

      return { previousSlotTemplates }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        context?.previousSlotTemplates,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })
    },
  })

  const updateSlotTemplate = useMutation({
    mutationKey: [SLOT_TEMPLATE.UPDATE],
    mutationFn: SlotTemplateApi.update,
    onMutate: async (updatedSlotTemplate: UpdateSlotTemplateParams) => {
      await queryClient.cancelQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })

      const previousSlotTemplates = queryClient.getQueryData([
        SLOT_TEMPLATE.GET_ALL,
      ])
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        (oldSlotTemplates: SlotTemplate[]) =>
          oldSlotTemplates?.map((slotTemplate: SlotTemplate) =>
            slotTemplate.id === updatedSlotTemplate.id
              ? updatedSlotTemplate
              : slotTemplate,
          ),
      )

      return { previousSlotTemplates }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        context?.previousSlotTemplates,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })
    },
  })

  useDataFetching({
    isPending: createSlotTemplate.isPending,
    isError: createSlotTemplate.isError,
    error: createSlotTemplate.error,
    errorMessage: 'Erreur lors de la création du template de créneau',
  })

  useDataFetching({
    isPending: updateSlotTemplate.isPending,
    isError: updateSlotTemplate.isError,
    error: updateSlotTemplate.error,
    errorMessage: 'Erreur lors de la modification du template de créneau',
  })

  useDataFetching({
    isPending: deleteSlotTemplate.isPending,
    isError: deleteSlotTemplate.isError,
    error: deleteSlotTemplate.error,
    errorMessage: 'Erreur lors de la suppression du template de créneau',
  })

  return { createSlotTemplate, deleteSlotTemplate, updateSlotTemplate }
}
