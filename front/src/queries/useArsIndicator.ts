import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ArsIndicatorApi } from '../api/arsIndicator.api.ts'
import { ARS_INDICATOR } from '../constants/process.constant.ts'
import type { ArsAnswerBody } from '../types/arsIndicator.ts'

export const useArsIndicatorsQuery = (from: string, to: string) => {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [ARS_INDICATOR.GET, from, to],
    queryFn: () => ArsIndicatorApi.get(from, to),
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

// Invalide toute requête d'indicateurs ARS en cache, quelle que soit la période demandée :
// une saisie change l'année civile `manualYear` seulement, mais la clé porte `from`/`to`.
export const useSaveArsAnswerMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      year,
      code,
      body,
    }: {
      year: number
      code: string
      body: ArsAnswerBody
    }) => ArsIndicatorApi.saveAnswer(year, code, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ARS_INDICATOR.GET] })
    },
  })
}
