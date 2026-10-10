import { useQuery } from '@tanstack/react-query'

import { ActivityApi } from '../api/activity.api.ts'
import { ACTIVITY } from '../constants/process.constant.ts'

export const useActivityQuery = (
  from: string,
  to: string,
  pathwayTemplateId?: string,
) => {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: [ACTIVITY.GET, from, to, pathwayTemplateId],
    queryFn: () => ActivityApi.get(from, to, pathwayTemplateId),
    retry: 0,
  })
  return { report: data, isPending, error, refetch }
}
