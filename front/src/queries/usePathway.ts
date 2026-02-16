import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PathwayApi } from '../api/pathway.api.ts'
import { PATHWAY, SLOT } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreatePathwayParams,
  InstantiatePathwayParams,
  Pathway,
  UpdatePathwayParams,
} from '../types/pathway.ts'

// * QUERIES

export const usePathwayQueries = () => {
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

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { pathways, isPending, error }
}

// * MUTATIONS

export const usePathwayMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

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
    onSuccess: () => {
      toast({
        title: 'Parcours créé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATHWAY.GET_ALL], context?.previousPathways)

      toast({
        title: 'Erreur lors de la création du parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
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
      await queryClient.invalidateQueries({ queryKey: [PATHWAY.GET_ALL] })

      toast({
        title: 'Parcours instancié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATHWAY.INSTANTIATE], context?.previousPathways)

      toast({
        title: "Erreur lors de l'instanciation du parcours",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY.INSTANTIATE],
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
    onSuccess: () => {
      toast({
        title: 'Parcours supprimé avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATHWAY.GET_ALL], context?.previousPathways)

      toast({
        title: 'Erreur lors de la suppression du parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [PATHWAY.GET_ALL] })
      await queryClient.invalidateQueries({ queryKey: [SLOT.GET_ALL] })
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
    onSuccess: () => {
      toast({
        title: 'Parcours modifié avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([PATHWAY.GET_ALL], context?.previousPathways)

      toast({
        title: 'Erreur lors de la mise à jour du parcours',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PATHWAY.GET_ALL],
      })
    },
  })

  return { createPathway, deletePathway, updatePathway, instantiatePathway }
}
