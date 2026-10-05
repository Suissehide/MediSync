import { tenantApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { ArsIndicators } from '@/types/arsIndicator.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

const url = (from: string, to: string) =>
  `${tenantApiUrl()}/indicateurs-ars?from=${from}&to=${to}`

export const ArsIndicatorApi = {
  get: async (from: string, to: string): Promise<ArsIndicators> => {
    const response = await fetchWithAuth(url(from, to))
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de charger les indicateurs ARS')
    }
    return await response.json()
  },

  exportExcel: async (from: string, to: string): Promise<Blob> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/indicateurs-ars/export?from=${from}&to=${to}`,
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible d'exporter les indicateurs ARS")
    }
    return await response.blob()
  },
}
