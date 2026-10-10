import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { PlanningCycleApi } from '../api/planningCycle.api.ts'
import { PLANNING_CYCLE } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'
import type { PlanningCycle } from '../types/planningCycle.ts'
import { useForbiddenWeekQueries } from './useForbiddenWeek.ts'

export const usePlanningCycleQueries = () => {
  const { data, isPending, isError, error } = useQuery({
    queryKey: [PLANNING_CYCLE.GET],
    queryFn: PlanningCycleApi.get,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  const { forbiddenWeeks } = useForbiddenWeekQueries()
  const planningCycle = useMemo(
    () =>
      data && {
        ...data,
        forbiddenWeekStarts: (forbiddenWeeks ?? []).map((w) => w.startOfWeek),
      },
    [data, forbiddenWeeks],
  )

  return { planningCycle, isPending }
}

export const usePlanningCycleMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const savePlanningCycle = useMutation({
    mutationKey: [PLANNING_CYCLE.SAVE],
    mutationFn: (cycle: PlanningCycle) => PlanningCycleApi.save(cycle),
    onSuccess: () => {
      toast({
        title: 'Cycle de semaines enregistré',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: "Erreur lors de l'enregistrement du cycle",
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [PLANNING_CYCLE.GET] })
    },
  })

  const resetPlanningCycle = useMutation({
    mutationKey: [PLANNING_CYCLE.RESET],
    mutationFn: () => PlanningCycleApi.reset(),
    onSuccess: () => {
      toast({
        title: 'Numérotation ISO rétablie',
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors de la réinitialisation du cycle',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [PLANNING_CYCLE.GET] })
    },
  })

  return { savePlanningCycle, resetPlanningCycle }
}
