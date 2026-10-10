import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { IndicatorSetApi } from '../api/indicatorSet.api.ts'
import { INDICATOR_SET } from '../constants/process.constant.ts'
import type { IndicatorAnswerBody } from '../types/indicatorSet.ts'

// Jeux actifs du service, dans l'ordre ; `enabled` laisse la barre de navigation n'interroger que sous un service.
export const useIndicatorSetsQuery = (enabled = true) => {
  const { data, isPending, error } = useQuery({
    queryKey: [INDICATOR_SET.LIST],
    queryFn: IndicatorSetApi.list,
    enabled,
  })
  return {
    sets: data
      ?.filter((set) => !set.archived)
      .sort((a, b) => a.order - b.order),
    isPending,
    error,
  }
}

export const useIndicatorResultsQuery = (
  setId: string,
  from: string,
  to: string,
) => {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [INDICATOR_SET.RESULTS, setId, from, to],
    queryFn: () => IndicatorSetApi.results(setId, from, to),
    retry: 0,
  })
  return {
    indicators: data?.indicators,
    manualYear: data?.manualYear ?? null,
    isPending,
    error,
    refetch,
  }
}

// Une saisie change l'année civile `manualYear` seulement, mais la clé porte `from`/`to` : tout le jeu est invalidé.
export const useSaveIndicatorAnswerMutation = (setId: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      year,
      indicatorId,
      body,
    }: {
      year: number
      indicatorId: string
      body: IndicatorAnswerBody
    }) => IndicatorSetApi.saveAnswer(setId, year, indicatorId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [INDICATOR_SET.RESULTS, setId],
      })
    },
  })
}
