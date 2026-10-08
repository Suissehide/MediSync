import { useQuery } from '@tanstack/react-query'

import { ActivityApi } from '../api/activity.api.ts'
import { ACTIVITY } from '../constants/process.constant.ts'

export const useActivityQuery = (from: string, to: string) => {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [ACTIVITY.GET, from, to],
    queryFn: () => ActivityApi.get(from, to),
    retry: 0,
  })
  return { report: data, isPending, error, refetch }
}
