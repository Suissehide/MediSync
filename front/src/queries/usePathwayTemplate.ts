import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PathwayTemplateApi } from '../api/pathwayTemplate.api.ts'
import { PATHWAY_TEMPLATE } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreatePathwayTemplateParams,
  PathwayTemplate,
  UpdatePathwayTemplateParams,
} from '../types/pathwayTemplate.ts'

// * QUERIES

export const usePathwayTemplateQueries = () => {
  const getAllPathwayTemplates = async () => {
    return await PathwayTemplateApi.getAll()
  }
  const {
    data: pathwayTemplates,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PATHWAY_TEMPLATE.GET_ALL],
    queryFn: getAllPathwayTemplates,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { pathwayTemplates, isPending, error }
}

export const usePathwayTemplateByIDQuery = (
  pathwayTemplateID: string,
  options = {},
) => {
  const {
    data: pathwayTemplate,
    isPending,
    isError,
    error,
    refetch,
    isFetched,
  } = useQuery({
    queryKey: [PATHWAY_TEMPLATE.GET_BY_ID, pathwayTemplateID],
    queryFn: () => PathwayTemplateApi.getByID(pathwayTemplateID),
    enabled: !!pathwayTemplateID,
    retry: 0,
    ...options,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { pathwayTemplate, isPending, isError, error, refetch, isFetched }
}

// * MUTATIONS

export const usePathwayTemplateMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createPathwayTemplate = useMutation({
    mutationKey: [PATHWAY_TEMPLATE.CREATE],
    mutationFn: PathwayTemplateApi.create,
    onMutate: async (newPathwayTemplate: CreatePathwayTemplateParams) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY_TEMPLATE.GET_ALL] })

      const previousPathwayTemplates = queryClient.getQueryData([
        PATHWAY_TEMPLATE.GET_ALL,
      ])
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        (oldPathwayTemplates: PathwayTemplate[]) => [
          ...(oldPathwayTemplates || []),
          newPathwayTemplate,
        ],
      )

      return { previousPathwayTemplates }
    },
    onSuccess: () => {
      toast({
        title: 'Template de parcours créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        context?.previousPathwayTemplates,
      )

      toast({
        title: 'Erreur lors de la création du template de parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
    },
  })

  const deletePathwayTemplate = useMutation({
    mutationKey: [PATHWAY_TEMPLATE.DELETE],
    mutationFn: PathwayTemplateApi.delete,
    onMutate: async (pathwayTemplateID) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY_TEMPLATE.GET_ALL] })

      const previousPathwayTemplates = queryClient.getQueryData([
        PATHWAY_TEMPLATE.GET_ALL,
      ])
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        (oldPathwayTemplates: PathwayTemplate[]) =>
          oldPathwayTemplates?.filter(
            (pathwayTemplate: PathwayTemplate) =>
              pathwayTemplate.id !== pathwayTemplateID,
          ),
      )

      return { previousPathwayTemplates }
    },
    onSuccess: () => {
      toast({
        title: 'Template de parcours supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        context?.previousPathwayTemplates,
      )

      toast({
        title: 'Erreur lors de la supression du template de parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
    },
  })

  const updatePathwayTemplate = useMutation({
    mutationKey: [PATHWAY_TEMPLATE.UPDATE],
    mutationFn: PathwayTemplateApi.update,
    onMutate: async (updatedPathwayTemplate: UpdatePathwayTemplateParams) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY_TEMPLATE.GET_ALL] })
      const previousPathwayTemplates = queryClient.getQueryData([
        PATHWAY_TEMPLATE.GET_ALL,
      ])
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        (oldPathwayTemplates: PathwayTemplate[]) =>
          oldPathwayTemplates?.map((pathwayTemplate: PathwayTemplate) =>
            pathwayTemplate.id === updatedPathwayTemplate.id
              ? updatedPathwayTemplate
              : pathwayTemplate,
          ),
      )

      return { previousPathwayTemplates }
    },
    onSuccess: () => {
      toast({
        title: 'Template de parcours modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        context?.previousPathwayTemplates,
      )

      toast({
        title: 'Erreur lors de la mise à jour du template de parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
    },
  })

  return { createPathwayTemplate, deletePathwayTemplate, updatePathwayTemplate }
}
