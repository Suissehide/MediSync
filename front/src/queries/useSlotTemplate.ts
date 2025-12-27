import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { SlotTemplateApi } from '../api/slotTemplate.api.ts'
import {
  PATHWAY_TEMPLATE,
  SLOT_TEMPLATE,
} from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateSlotTemplateParams,
  SlotTemplate,
  UpdateSlotTemplateParams,
} from '../types/slotTemplate.ts'

// * QUERIES

export const useSlotTemplateQueries = () => {
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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { slotTemplates, isPending, error }
}

export const useSlotTemplateByIDQuery = (
  slotTemplateID: string,
  options = {},
) => {
  const {
    data: slotTemplate,
    isPending,
    isError,
    error,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: [SLOT_TEMPLATE.GET_BY_ID, slotTemplateID],
    queryFn: () => SlotTemplateApi.getByID(slotTemplateID),
    enabled: !!slotTemplateID,
    retry: 0,
    ...options,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { slotTemplate, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const useSlotTemplateMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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
    onSuccess: () => {
      toast({
        title: 'Template de créneau créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        context?.previousSlotTemplates,
      )

      toast({
        title: 'Erreur lors de la création du template de créneau',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
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
    onSuccess: () => {
      toast({
        title: 'Template de créneau supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        context?.previousSlotTemplates,
      )

      toast({
        title: 'Erreur lors de la suppression du template de créneau',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
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
    onSuccess: () => {
      toast({
        title: 'Template de créneau modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [SLOT_TEMPLATE.GET_ALL],
        context?.previousSlotTemplates,
      )

      toast({
        title: 'Erreur lors de la mise à jour du template de créneau',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT_TEMPLATE.GET_ALL] })
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
    },
  })

  return { createSlotTemplate, deleteSlotTemplate, updateSlotTemplate }
}
