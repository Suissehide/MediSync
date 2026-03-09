import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ForbiddenWeekApi } from '../api/forbiddenWeek.api.ts'
import { FORBIDDEN_WEEK } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'

export const useForbiddenWeekQueries = () => {
  const { data: forbiddenWeeks, isPending, isError, error } = useQuery({
    queryKey: [FORBIDDEN_WEEK.GET_ALL],
    queryFn: ForbiddenWeekApi.getAll,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { forbiddenWeeks, isPending }
}

export const useForbiddenWeekMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const createForbiddenWeek = useMutation({
    mutationKey: [FORBIDDEN_WEEK.CREATE],
    mutationFn: (date: string) => ForbiddenWeekApi.create(date),
    onSuccess: () => {
      toast({ title: 'Semaine interdite ajoutée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'ajout de la semaine interdite",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FORBIDDEN_WEEK.GET_ALL] })
    },
  })

  const deleteForbiddenWeek = useMutation({
    mutationKey: [FORBIDDEN_WEEK.DELETE],
    mutationFn: (id: string) => ForbiddenWeekApi.delete(id),
    onSuccess: () => {
      toast({ title: 'Semaine interdite supprimée', severity: TOAST_SEVERITY.SUCCESS })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la suppression de la semaine interdite',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [FORBIDDEN_WEEK.GET_ALL] })
    },
  })

  return { createForbiddenWeek, deleteForbiddenWeek }
}
