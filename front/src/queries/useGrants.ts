import { useQuery } from '@tanstack/react-query'

import { EstablishmentGrantsApi } from '@/api/grants.api.ts'
import { GRANT_ESTABLISHMENT } from '@/constants/process.constant.ts'
import { useDataFetching } from '@/hooks/useDataFetching.ts'

// * QUERIES

export const useEstablishmentGrantsQuery = () => {
  const {
    data: grants,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [GRANT_ESTABLISHMENT.GET_ALL],
    queryFn: EstablishmentGrantsApi.getAll,
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { grants, isPending, error }
}
