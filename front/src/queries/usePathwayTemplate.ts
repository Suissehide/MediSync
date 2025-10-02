import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { PATHWAY_TEMPLATE } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { PathwayTemplateApi } from '../api/pathwayTemplate.ts'
import type {
  CreatePathwayTemplateParams,
  PathwayTemplate,
  UpdatePathwayTemplateParams,
} from '../types/pathwayTemplate.ts'

// * QUERIES

export const usePathwayTemplateQueries = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING
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

  const errorMessageText =
    isError && error instanceof Error ? error.message : defaultErrorMessage

  useDataFetching({
    isPending,
    isError,
    error,
    errorMessage: errorMessageText,
  })

  return { pathwayTemplates, isPending, error }
}

// * MUTATIONS

export const usePathwayTemplateMutations = () => {
  const queryClient = useQueryClient()

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
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        context?.previousPathwayTemplates,
      )
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
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        context?.previousPathwayTemplates,
      )
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
    onError: (_, __, context) => {
      queryClient.setQueryData(
        [PATHWAY_TEMPLATE.GET_ALL],
        context?.previousPathwayTemplates,
      )
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY_TEMPLATE.GET_ALL],
      })
    },
  })

  useDataFetching({
    isPending: createPathwayTemplate.isPending,
    isError: createPathwayTemplate.isError,
    error: createPathwayTemplate.error,
    errorMessage: 'Erreur lors de la création du template de parcours',
  })

  useDataFetching({
    isPending: updatePathwayTemplate.isPending,
    isError: updatePathwayTemplate.isError,
    error: updatePathwayTemplate.error,
    errorMessage: 'Erreur lors de la modification du template de parcours',
  })

  useDataFetching({
    isPending: deletePathwayTemplate.isPending,
    isError: deletePathwayTemplate.isError,
    error: deletePathwayTemplate.error,
    errorMessage: 'Erreur lors de la suppression du template de parcours',
  })

  return { createPathwayTemplate, deletePathwayTemplate, updatePathwayTemplate }
}
