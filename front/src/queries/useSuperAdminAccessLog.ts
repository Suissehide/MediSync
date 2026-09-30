import { keepPreviousData, useQuery } from '@tanstack/react-query'

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
  const { data, isPending, isError, error } = useQuery({
    queryKey: [SUPER_ADMIN.GET_ACCESS_LOG, params],
    queryFn: () => SuperAdminAccessLogApi.getAll(params),
    retry: 0,
    // Changer de page garde la page précédente affichée jusqu'à l'arrivée de la suivante, plutôt
    // que de vider la table (même choix que `useActivityLogsQuery`, l'autre journal paginé).
    placeholderData: keepPreviousData,
  })

  useDataFetching({ isPending, isError, error })

  return { data, isPending, error }
}
