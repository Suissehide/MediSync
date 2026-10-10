import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ServiceFieldApi } from '../api/serviceField.api.ts'
import { PATIENT, SERVICE_FIELD } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { ServiceField } from '../types/serviceField.ts'

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
  ) => ({
    mutationKey: [mutationKey],
    mutationFn,
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

  const create = useMutation(
    options(
      SERVICE_FIELD.CREATE,
      ServiceFieldApi.create,
      'Erreur lors de la création du champ',
    ),
  )
  const update = useMutation(
    options(
      SERVICE_FIELD.UPDATE,
      ServiceFieldApi.update,
      'Erreur lors de la modification du champ',
    ),
  )
  const createChoice = useMutation(
    options(
      SERVICE_FIELD.CREATE_CHOICE,
      ServiceFieldApi.createChoice,
      'Erreur lors de l’ajout du choix',
    ),
  )
  const updateChoice = useMutation(
    options(
      SERVICE_FIELD.UPDATE_CHOICE,
      ServiceFieldApi.updateChoice,
      'Erreur lors de la modification du choix',
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
      SERVICE_FIELD.REORDER,
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
