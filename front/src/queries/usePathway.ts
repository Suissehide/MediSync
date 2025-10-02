import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AUTH_MESSAGES } from '../constants/message.constant.ts'
import { PATHWAY, SLOT } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { PathwayApi } from '../api/pathway.ts'
import type {
  CreatePathwayParams,
  InstantiatePathwayParams,
  Pathway,
  UpdatePathwayParams,
} from '../types/pathway.ts'

// * QUERIES

export const usePathwayQueries = () => {
  const defaultErrorMessage = AUTH_MESSAGES.ERROR_FETCHING
  const getAllPathways = async () => {
    return await PathwayApi.getAll()
  }
  const {
    data: pathways,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [PATHWAY.GET_ALL],
    queryFn: getAllPathways,
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

  return { pathways, isPending, error }
}

// * MUTATIONS

export const usePathwayMutations = () => {
  const queryClient = useQueryClient()

  const createPathway = useMutation({
    mutationKey: [PATHWAY.CREATE],
    mutationFn: PathwayApi.create,
    onMutate: async (newPathway: CreatePathwayParams) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY.GET_ALL] })

      const previousPathways = queryClient.getQueryData([PATHWAY.GET_ALL])
      queryClient.setQueryData([PATHWAY.GET_ALL], (oldPathways: Pathway[]) => [
        ...(oldPathways || []),
        newPathway,
      ])

      return { previousPathways }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([PATHWAY.GET_ALL], context?.previousPathways)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY.GET_ALL],
      })
    },
  })

  const instantiatePathway = useMutation({
    mutationKey: [PATHWAY.INSTANTIATE],
    mutationFn: PathwayApi.instantiate,
    onMutate: async (newPathway: InstantiatePathwayParams) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY.INSTANTIATE] })

      const previousPathways = queryClient.getQueryData([PATHWAY.INSTANTIATE])
      queryClient.setQueryData(
        [PATHWAY.INSTANTIATE],
        (oldPathways: Pathway[]) => [...(oldPathways || []), newPathway],
      )

      return { previousPathways }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([PATHWAY.INSTANTIATE], context?.previousPathways)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY.INSTANTIATE],
      })
    },
  })

  const updatePathway = useMutation({
    mutationKey: [PATHWAY.UPDATE],
    mutationFn: PathwayApi.update,
    onMutate: async (updatedPathway: UpdatePathwayParams) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY.GET_ALL] })

      const previousPathways = queryClient.getQueryData([PATHWAY.GET_ALL])
      queryClient.setQueryData([PATHWAY.GET_ALL], (oldPathways: Pathway[]) =>
        oldPathways?.map((pathway: Pathway) =>
          pathway.id === updatedPathway.id ? updatedPathway : pathway,
        ),
      )

      return { previousPathways }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([PATHWAY.GET_ALL], context?.previousPathways)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY.GET_ALL],
      })
    },
  })

  const deletePathway = useMutation({
    mutationKey: [PATHWAY.DELETE],
    mutationFn: PathwayApi.delete,
    onMutate: async (pathwayID) => {
      await queryClient.cancelQueries({ queryKey: [PATHWAY.GET_ALL] })

      const previousPathways = queryClient.getQueryData([PATHWAY.GET_ALL])
      queryClient.setQueryData([PATHWAY.GET_ALL], (oldPathways: Pathway[]) =>
        oldPathways?.filter((pathway: Pathway) => pathway.id !== pathwayID),
      )

      return { previousPathways }
    },
    onError: (_, __, context) => {
      queryClient.setQueryData([PATHWAY.GET_ALL], context?.previousPathways)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY.GET_ALL],
      })
    },
  })

  useDataFetching({
    isPending: createPathway.isPending,
    isError: createPathway.isError,
    error: createPathway.error,
    errorMessage: 'Erreur lors de la création du parcours',
  })

  useDataFetching({
    isPending: updatePathway.isPending,
    isError: updatePathway.isError,
    error: updatePathway.error,
    errorMessage: 'Erreur lors de la modification du parcours',
  })

  useDataFetching({
    isPending: deletePathway.isPending,
    isError: deletePathway.isError,
    error: deletePathway.error,
    errorMessage: 'Erreur lors de la suppression du parcours',
  })

  useDataFetching({
    isPending: instantiatePathway.isPending,
    isError: instantiatePathway.isError,
    error: instantiatePathway.error,
    errorMessage: "Erreur lors de l'instanciation du parcours",
  })

  return { createPathway, deletePathway, updatePathway, instantiatePathway }
}
