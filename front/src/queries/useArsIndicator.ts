import { useQuery } from '@tanstack/react-query'

import { ArsIndicatorApi } from '../api/arsIndicator.api.ts'
import { ARS_INDICATOR } from '../constants/process.constant.ts'

export const useArsIndicatorsQuery = (from: string, to: string) => {
  const { data, isPending, error } = useQuery({
    queryKey: [ARS_INDICATOR.GET, from, to],
    queryFn: () => ArsIndicatorApi.get(from, to),
    retry: 0,
  })
  return { indicators: data?.indicators, isPending, error }
}
