import { tenantApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { ActivityReport } from '@/types/activity.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const ActivityApi = {
  get: async (
    from: string,
    to: string,
    pathwayTemplateId?: string,
  ): Promise<ActivityReport> => {
    const parcours = pathwayTemplateId
      ? `&pathwayTemplateId=${pathwayTemplateId}`
      : ''
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/activite?from=${from}&to=${to}${parcours}`,
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible de charger l'activité du service",
      )
    }
    return await response.json()
  },
}
