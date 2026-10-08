import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { LocationApi } from '../api/location.api.ts'
import { undoToastAction } from '../components/custom/undoToastAction.tsx'
import { LOCATION } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import {
  restoreForTenant,
  snapshotForTenant,
} from '../hooks/useTenantSwitch.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateLocationParams,
  Location,
  UpdateLocationParams,
} from '../types/location.ts'

// * QUERIES

export const useLocationQueries = (archived = false) => {
  const {
    data: locations,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [LOCATION.GET_ALL, archived],
    queryFn: () => LocationApi.getAll(archived),
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

      const previousLocations = snapshotForTenant(queryClient, [
        LOCATION.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [LOCATION.GET_ALL, false],
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
      restoreForTenant(queryClient, context?.previousLocations)

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

  const restoreLocation = useMutation({
    mutationKey: [LOCATION.RESTORE],
    mutationFn: (locationID: string) =>
      LocationApi.update({ id: locationID, archived: false }),
    onSuccess: () => {
      toast({ title: 'Salle restaurée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la restauration de la salle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [LOCATION.GET_ALL] })
    },
  })

  const archiveLocation = useMutation({
    mutationKey: [LOCATION.ARCHIVE],
    mutationFn: LocationApi.archive,
    onMutate: async (locationID: string) => {
      await queryClient.cancelQueries({ queryKey: [LOCATION.GET_ALL] })

      const previousLocations = snapshotForTenant(queryClient, [
        LOCATION.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [LOCATION.GET_ALL, false],
        (oldLocations: Location[]) =>
          oldLocations?.filter(
            (location: Location) => location.id !== locationID,
          ),
      )

      return { previousLocations }
    },
    onSuccess: (_, locationID) => {
      toast({
        title: 'Salle archivée',
        message: 'Les créneaux existants la conservent.',
        severity: TOAST_SEVERITY.SUCCESS,
        action: undoToastAction(() => restoreLocation.mutate(locationID)),
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousLocations)

      toast({
        title: 'Erreur lors de l’archivage de la salle',
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

      const previousLocations = snapshotForTenant(queryClient, [
        LOCATION.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [LOCATION.GET_ALL, false],
        (oldLocations: Location[]) =>
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
      restoreForTenant(queryClient, context?.previousLocations)

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

  // Suppression definitive, depuis la liste archivee. Le serveur refuse en 409
  // tant que quelque chose reference la ligne, et son message nomme quoi.
  const deleteForeverLocation = useMutation({
    mutationKey: [LOCATION.DELETE_FOREVER],
    mutationFn: LocationApi.deleteForever,
    onSuccess: () => {
      toast({
        title: 'Salle supprimée définitivement',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Suppression impossible',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [LOCATION.GET_ALL] })
    },
  })

  return {
    createLocation,
    archiveLocation,
    restoreLocation,
    updateLocation,
    deleteForeverLocation,
  }
}
