import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { LocationApi } from '../api/location.api.ts'
import { LOCATION } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateLocationParams,
  Location,
  UpdateLocationParams,
} from '../types/location.ts'

// * QUERIES

export const useLocationQueries = () => {
  const {
    data: locations,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [LOCATION.GET_ALL],
    queryFn: LocationApi.getAll,
    retry: 0,
  })

  useDataFetching({
    isPending,
    isError,
    error,
  })

  return { locations, isPending, error }
}

// * MUTATIONS

export const useLocationMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createLocation = useMutation({
    mutationKey: [LOCATION.CREATE],
    mutationFn: LocationApi.create,
    onMutate: async (newLocation: CreateLocationParams) => {
      await queryClient.cancelQueries({ queryKey: [LOCATION.GET_ALL] })

      const previousLocations = queryClient.getQueryData([LOCATION.GET_ALL])
      queryClient.setQueryData(
        [LOCATION.GET_ALL],
        (oldLocations: Location[]) => [
          ...(oldLocations || []),
          { ...newLocation, id: 'temp' },
        ],
      )

      return { previousLocations }
    },
    onSuccess: () => {
      toast({
        title: 'Salle créée avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([LOCATION.GET_ALL], context?.previousLocations)

      toast({
        title: 'Erreur lors de la création de la salle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [LOCATION.GET_ALL] })
    },
  })

  const deleteLocation = useMutation({
    mutationKey: [LOCATION.DELETE],
    mutationFn: LocationApi.delete,
    onMutate: async (locationID) => {
      await queryClient.cancelQueries({ queryKey: [LOCATION.GET_ALL] })

      const previousLocations = queryClient.getQueryData([LOCATION.GET_ALL])
      queryClient.setQueryData([LOCATION.GET_ALL], (oldLocations: Location[]) =>
        oldLocations?.filter(
          (location: Location) => location.id !== locationID,
        ),
      )

      return { previousLocations }
    },
    onSuccess: () => {
      toast({
        title: 'Salle supprimée avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([LOCATION.GET_ALL], context?.previousLocations)

      toast({
        title: 'Erreur lors de la suppression de la salle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [LOCATION.GET_ALL] })
    },
  })

  const updateLocation = useMutation({
    mutationKey: [LOCATION.UPDATE],
    mutationFn: LocationApi.update,
    onMutate: async (updatedLocation: UpdateLocationParams) => {
      await queryClient.cancelQueries({ queryKey: [LOCATION.GET_ALL] })

      const previousLocations = queryClient.getQueryData([LOCATION.GET_ALL])
      queryClient.setQueryData([LOCATION.GET_ALL], (oldLocations: Location[]) =>
        oldLocations?.map((location: Location) =>
          location.id === updatedLocation.id
            ? { ...location, ...updatedLocation }
            : location,
        ),
      )

      return { previousLocations }
    },
    onSuccess: () => {
      toast({
        title: 'Salle modifiée avec succès',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error, __, context) => {
      queryClient.setQueryData([LOCATION.GET_ALL], context?.previousLocations)

      toast({
        title: 'Erreur lors de la mise à jour de la salle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [LOCATION.GET_ALL] })
    },
  })

  return { createLocation, deleteLocation, updateLocation }
}
