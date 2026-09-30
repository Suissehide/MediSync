import { useQuery } from '@tanstack/react-query'

import { SuperAdminAccessLogApi } from '../api/superAdminAccessLog.api.ts'
import { SUPER_ADMIN } from '../constants/process.constant.ts'
import { useDataFetching } from '../hooks/useDataFetching.ts'
import type { SuperAdminAccessLogQuery } from '../types/superAdminAccessLog.ts'

// Les deux journaux à l'échelle de la plateforme — `GET
// /super-admin/access-log`. Même raisonnement que `useSuperAdminEstablishmentQuery` (exception
// déclarée dans `conventions-tenant-api-queries.test.ts`) : les filtres passés dans `params`
// (établissement, compte, action) sont des DONNÉES de la requête demandée, jamais un tenant
// implicite — ces écrans vivent hors de tout layout de tenant, sous le seul `QueryClient` courant
// (`api/superAdminAccessLog.api.ts`).
export const useSuperAdminAccessLogQuery = (
  params: SuperAdminAccessLogQuery,
) => {
  const {
    data: entries,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: [SUPER_ADMIN.GET_ACCESS_LOG, params],
    queryFn: () => SuperAdminAccessLogApi.getAll(params),
    retry: 0,
  })

  useDataFetching({ isPending, isError, error })

  return { entries, isPending, error }
}
