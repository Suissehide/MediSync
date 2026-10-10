import { tenantApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type {
  IndicatorAnswer,
  IndicatorAnswerBody,
  IndicatorResults,
  IndicatorSet,
} from '@/types/indicatorSet.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

const url = (chemin = '') => `${tenantApiUrl()}/indicator-sets${chemin}`

export const IndicatorSetApi = {
  list: async (): Promise<IndicatorSet[]> => {
    const response = await fetchWithAuth(url())
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible de charger les jeux d'indicateurs",
      )
    }
    return await response.json()
  },

  results: async (
    setId: string,
    from: string,
    to: string,
  ): Promise<IndicatorResults> => {
    const response = await fetchWithAuth(
      url(`/${setId}/results?from=${from}&to=${to}`),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de charger les indicateurs')
    }
    return await response.json()
  },

  exportExcel: async (
    setId: string,
    from: string,
    to: string,
  ): Promise<Blob> => {
    const response = await fetchWithAuth(
      url(`/${setId}/export?from=${from}&to=${to}`),
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible d'exporter les indicateurs")
    }
    return await response.blob()
  },

  saveAnswer: async (
    setId: string,
    year: number,
    indicatorId: string,
    body: IndicatorAnswerBody,
  ): Promise<IndicatorAnswer> => {
    const response = await fetchWithAuth(
      url(`/${setId}/answers/${year}/${indicatorId}`),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible d'enregistrer la réponse")
    }
    return await response.json()
  },
}
