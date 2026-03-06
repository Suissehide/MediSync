import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ActivityLogApi, type GetActivityLogsParams } from '../api/activityLog.api.ts'
import { ACTIVITY_LOG } from '../constants/process.constant.ts'
import { TOAST_SEVERITY } from '../constants/ui.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import { useToast } from '../hooks/useToast.ts'

export const useActivityLogsQuery = (params: GetActivityLogsParams = {}) => {
  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [ACTIVITY_LOG.GET_ALL, params],
    queryFn: () => ActivityLogApi.getAll(params),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { data, isPending }
}

export const useActivityLogMutations = () => {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const cleanup = useMutation({
    mutationKey: [ACTIVITY_LOG.CLEANUP],
    mutationFn: ActivityLogApi.cleanup,
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: [ACTIVITY_LOG.GET_ALL] })
      toast({
        title: `${deleted} log(s) supprimé(s)`,
        severity: TOAST_SEVERITY.SUCCESS,
      })
    },
    onError: (error) => {
      toast({
        title: 'Erreur lors du nettoyage',
        message: error.message,
        severity: TOAST_SEVERITY.ERROR,
      })
    },
  })

  return { cleanup }
}
