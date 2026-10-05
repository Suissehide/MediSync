import { useQuery } from '@tanstack/react-query'

import { ArsIndicatorApi } from '../api/arsIndicator.api.ts'
import { ARS_INDICATOR } from '../constants/process.constant.ts'

export const useArsIndicatorsQuery = (year: number) => {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  const { data, isPending, isError } = useQuery({
    queryKey: [ARS_INDICATOR.GET, year],
    queryFn: () => ArsIndicatorApi.get(from, to),
    retry: 0,
  })
  return { indicators: data?.indicators ?? [], isPending, isError, from, to }
}
