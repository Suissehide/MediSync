import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ServiceFieldApi } from '../api/serviceField.api.ts'
import { PATIENT, SERVICE_FIELD } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type {
  ServiceField,
  UpdateServiceFieldChoiceParams,
  UpdateServiceFieldParams,
} from '../types/serviceField.ts'

const NO_FIELDS: ServiceField[] = []

export const useServiceFieldsQuery = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [SERVICE_FIELD.GET_ALL],
    queryFn: ServiceFieldApi.getAll,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { fields: data ?? NO_FIELDS, isPending }
}

export const useServiceFieldMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const options = <TVariables, TData>(
    mutationKey: string,
    mutationFn: (variables: TVariables) => Promise<TData>,
    errorTitle: string,
    onSuccess?: (data: TData, variables: TVariables) => void,
  ) => ({
    mutationKey: [mutationKey],
    mutationFn,
    onSuccess,
    onError: (error: Error) => {
      toast({
        title: errorTitle,
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [SERVICE_FIELD.GET_ALL] }),
        queryClient.invalidateQueries({
          queryKey: [PATIENT.GET_ALL_WITH_TAGS],
        }),
      ])
    },
  })

  // Le meme PATCH generique porte modification/archivage/restauration : le message depend de `archived`.
  const archivedToast = (archived: boolean | undefined, nom: string) => {
    if (archived === true) {
      toast({ title: `${nom} archivé`, severity: TOAST_SEVERITY.SUCCESS })
    } else if (archived === false) {
      toast({ title: `${nom} restauré`, severity: TOAST_SEVERITY.SUCCESS })
    } else {
      toast({
        title: `${nom} modifié avec succès`,
        severity: TOAST_SEVERITY.SUCCESS,
      })
    }
  }

  const create = useMutation(
    options(
      SERVICE_FIELD.CREATE,
      ServiceFieldApi.create,
      'Erreur lors de la création du champ',
      () =>
        toast({
          title: 'Champ créé avec succès',
          severity: TOAST_SEVERITY.SUCCESS,
        }),
    ),
  )
  const update = useMutation(
    options(
      SERVICE_FIELD.UPDATE,
      ServiceFieldApi.update,
      'Erreur lors de la modification du champ',
      (_data: ServiceField, variables: UpdateServiceFieldParams) =>
        archivedToast(variables.archived, 'Champ'),
    ),
  )
  const createChoice = useMutation(
    options(
      SERVICE_FIELD.CREATE_CHOICE,
      ServiceFieldApi.createChoice,
      'Erreur lors de l’ajout du choix',
      () =>
        toast({
          title: 'Choix ajouté avec succès',
          severity: TOAST_SEVERITY.SUCCESS,
        }),
    ),
  )
  const updateChoice = useMutation(
    options(
      SERVICE_FIELD.UPDATE_CHOICE,
      ServiceFieldApi.updateChoice,
      'Erreur lors de la modification du choix',
      (_data: ServiceField, variables: UpdateServiceFieldChoiceParams) =>
        archivedToast(variables.archived, 'Choix'),
    ),
  )
  const reorder = useMutation(
    options(
      SERVICE_FIELD.REORDER,
      ServiceFieldApi.reorder,
      'Erreur lors du réordonnancement des champs',
    ),
  )
  const reorderChoices = useMutation(
    options(
      SERVICE_FIELD.REORDER_CHOICES,
      ServiceFieldApi.reorderChoices,
      'Erreur lors du réordonnancement des choix',
    ),
  )

  return {
    create,
    update,
    createChoice,
    updateChoice,
    reorder,
    reorderChoices,
  }
}
