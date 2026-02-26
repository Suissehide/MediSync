import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ThematicApi } from '../api/thematic.api.ts'
import { THEMATIC } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateThematicParams,
  Thematic,
  UpdateThematicParams,
} from '../types/thematic.ts'

// * QUERIES

export const useThematicQueries = () => {
  const {
    data: thematics,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [THEMATIC.GET_ALL],
    queryFn: ThematicApi.getAll,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { thematics, isPending, error }
}

// * MUTATIONS

export const useThematicMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createThematic = useMutation({
    mutationKey: [THEMATIC.CREATE],
    mutationFn: ThematicApi.create,
    onMutate: async (newThematic: CreateThematicParams) => {
      await queryClient.cancelQueries({ queryKey: [THEMATIC.GET_ALL] })

      const previousThematics = queryClient.getQueryData([THEMATIC.GET_ALL])
      queryClient.setQueryData(
        [THEMATIC.GET_ALL],
        (oldThematics: Thematic[]) => [
          ...(oldThematics || []),
          { ...newThematic, id: 'temp', soignants: [] },
        ],
      )

      return { previousThematics }
    },
    onSuccess: () => {
      toast({
        title: 'Thématique créée avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([THEMATIC.GET_ALL], context?.previousThematics)

      toast({
        title: 'Erreur lors de la création de la thématique',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [THEMATIC.GET_ALL] })
    },
  })

  const deleteThematic = useMutation({
    mutationKey: [THEMATIC.DELETE],
    mutationFn: ThematicApi.delete,
    onMutate: async (thematicID) => {
      await queryClient.cancelQueries({ queryKey: [THEMATIC.GET_ALL] })

      const previousThematics = queryClient.getQueryData([THEMATIC.GET_ALL])
      queryClient.setQueryData(
        [THEMATIC.GET_ALL],
        (oldThematics: Thematic[]) =>
          oldThematics?.filter(
            (thematic: Thematic) => thematic.id !== thematicID,
          ),
      )

      return { previousThematics }
    },
    onSuccess: () => {
      toast({
        title: 'Thématique supprimée avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([THEMATIC.GET_ALL], context?.previousThematics)

      toast({
        title: 'Erreur lors de la suppression de la thématique',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [THEMATIC.GET_ALL] })
    },
  })

  const updateThematic = useMutation({
    mutationKey: [THEMATIC.UPDATE],
    mutationFn: ThematicApi.update,
    onMutate: async (updatedThematic: UpdateThematicParams) => {
      await queryClient.cancelQueries({ queryKey: [THEMATIC.GET_ALL] })

      const previousThematics = queryClient.getQueryData([THEMATIC.GET_ALL])
      queryClient.setQueryData(
        [THEMATIC.GET_ALL],
        (oldThematics: Thematic[]) =>
          oldThematics?.map((thematic: Thematic) =>
            thematic.id === updatedThematic.id
              ? { ...thematic, ...updatedThematic }
              : thematic,
          ),
      )

      return { previousThematics }
    },
    onSuccess: () => {
      toast({
        title: 'Thématique modifiée avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([THEMATIC.GET_ALL], context?.previousThematics)

      toast({
        title: 'Erreur lors de la mise à jour de la thématique',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [THEMATIC.GET_ALL] })
    },
  })

  return { createThematic, deleteThematic, updateThematic }
}
