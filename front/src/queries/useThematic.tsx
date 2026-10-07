import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ThematicApi } from '../api/thematic.api.ts'
import { Button } from '../components/ui/button.tsx'
import { THEMATIC } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import {
  restoreForTenant,
  snapshotForTenant,
} from '../hooks/useTenantSwitch.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  CreateThematicParams,
  Thematic,
  UpdateThematicParams,
} from '../types/thematic.ts'

// * QUERIES

export const useThematicQueries = (archived = false) => {
  const {
    data: thematics,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [THEMATIC.GET_ALL, archived],
    queryFn: () => ThematicApi.getAll(archived),
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

      const previousThematics = snapshotForTenant(queryClient, [
        THEMATIC.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [THEMATIC.GET_ALL, false],
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
      restoreForTenant(queryClient, context?.previousThematics)

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

  const restoreThematic = useMutation({
    mutationKey: [THEMATIC.RESTORE],
    mutationFn: (thematicID: string) =>
      ThematicApi.update({ id: thematicID, archived: false }),
    onSuccess: () => {
      toast({
        title: 'Thématique restaurée',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la restauration de la thématique',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: [THEMATIC.GET_ALL] })
    },
  })

  const archiveThematic = useMutation({
    mutationKey: [THEMATIC.ARCHIVE],
    mutationFn: ThematicApi.archive,
    onMutate: async (thematicID: string) => {
      await queryClient.cancelQueries({ queryKey: [THEMATIC.GET_ALL] })

      const previousThematics = snapshotForTenant(queryClient, [
        THEMATIC.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [THEMATIC.GET_ALL, false],
        (oldThematics: Thematic[]) =>
          oldThematics?.filter(
            (thematic: Thematic) => thematic.id !== thematicID,
          ),
      )

      return { previousThematics }
    },
    onSuccess: (_, thematicID) => {
      // L'archivage est deja reversible cote serveur : « Annuler » rejoue une
      // restauration, il n'y a rien a rattraper dans un delai.
      toast({
        title: 'Thématique archivée',
        message: 'Les rendez-vous existants la conservent.',
        severity: TOAST_SEVERITY.SUCCESS,
        action: (
          <Button
            variant="none"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => restoreThematic.mutate(thematicID)}
          >
            Annuler
          </Button>
        ),
      })
    },
    onError: (error, __, context) => {
      restoreForTenant(queryClient, context?.previousThematics)

      toast({
        title: 'Erreur lors de l’archivage de la thématique',
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

      const previousThematics = snapshotForTenant(queryClient, [
        THEMATIC.GET_ALL,
        false,
      ])
      queryClient.setQueryData(
        [THEMATIC.GET_ALL, false],
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
      restoreForTenant(queryClient, context?.previousThematics)

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

  return { createThematic, archiveThematic, restoreThematic, updateThematic }
}
