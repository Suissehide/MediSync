import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  SuperAdminAccessLogQuery,
  SuperAdminAccessLogResponse,
} from '../types/superAdminAccessLog.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Le super-admin est hors de tout tenant (front/CLAUDE.md, § « Le contexte est implicite ») :
// pas de `tenantApiUrl()`/`establishmentApiUrl()` ici, un préfixe fixe comme le reste de
// `superAdmin.api.ts`. `establishmentId` ci-dessous est un FILTRE optionnel de la requête (`GET
// /super-admin/access-log?establishmentId=...`), une DONNÉE exactement comme
// `superAdmin.api.ts#getEstablishment` le prend déjà pour la même raison (voir l'exception
// déclarée dans `conventions-tenant-api-queries.test.ts`) — jamais un tenant implicite.
const SUPER_ADMIN_URL = () => `${apiUrl}/super-admin`

const buildQuery = (params: SuperAdminAccessLogQuery): string => {
  const query = new URLSearchParams({ source: params.source })
  if (params.establishmentId) {
    query.set('establishmentId', params.establishmentId)
  }
  if (params.compte) {
    query.set('compte', params.compte)
  }
  if (params.action) {
    query.set('action', params.action)
  }
  // Pagination (2026-10-01) : absents, ils ne sont pas envoyés du tout — c'est le back qui pose
  // les défauts (1 et 50), une seule fois, dans son schéma Zod. Même forme que les deux autres
  // journaux (`api/activityLog.api.ts`, `api/accessLog.api.ts`).
  if (params.page) {
    query.set('page', String(params.page))
  }
  if (params.pageSize) {
    query.set('pageSize', String(params.pageSize))
  }
  return query.toString()
}

export const SuperAdminAccessLogApi = {
  getAll: async (
    params: SuperAdminAccessLogQuery,
  ): Promise<SuperAdminAccessLogResponse> => {
    const response = await fetchWithAuth(
      `${SUPER_ADMIN_URL()}/access-log?${buildQuery(params)}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer le journal de la plateforme',
      )
    }
    return response.json()
  },
}
