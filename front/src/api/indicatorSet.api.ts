import { tenantApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError, messageDuServeur } from '@/libs/httpErrorHandler.ts'
import type {
  ActivitySettings,
  Indicator,
  IndicatorAnswer,
  IndicatorAnswerBody,
  IndicatorBody,
  IndicatorDefinition,
  IndicatorPreview,
  IndicatorResults,
  IndicatorSet,
  MeasureCatalogEntry,
} from '@/types/indicatorSet.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

const url = (chemin = '') => `${tenantApiUrl()}/indicator-sets${chemin}`

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

// Le 400 du back explique ce qui manque à la définition : on le relaie plutôt qu'un libellé générique.
const ecrire = async <T>(
  chemin: string,
  init: RequestInit,
  erreur: string,
): Promise<T> => {
  const response = await fetchWithAuth(url(chemin), init)
  if (!response.ok) {
    const message = await messageDuServeur(response)
    handleHttpError(
      response,
      message ? { 400: { title: erreur, message } } : {},
      erreur,
    )
  }
  return await response.json()
}

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

  createSet: (name: string): Promise<IndicatorSet> =>
    ecrire('', send('POST', { name }), 'Impossible de créer le jeu'),

  updateSet: ({
    id,
    ...body
  }: {
    id: string
    name?: string
    archived?: boolean
  }): Promise<IndicatorSet> =>
    ecrire(`/${id}`, send('PATCH', body), 'Impossible de modifier le jeu'),

  reorderSets: (ids: string[]): Promise<unknown> =>
    ecrire('/order', send('PUT', { ids }), 'Impossible de réordonner les jeux'),

  createIndicator: ({
    setId,
    body,
  }: {
    setId: string
    body: IndicatorBody
  }): Promise<Indicator> =>
    ecrire(
      `/${setId}/indicators`,
      send('POST', body),
      "Impossible de créer l'indicateur",
    ),

  updateIndicator: ({
    setId,
    id,
    body,
  }: {
    setId: string
    id: string
    body: Partial<IndicatorBody> & { archived?: boolean }
  }): Promise<Indicator> =>
    ecrire(
      `/${setId}/indicators/${id}`,
      send('PATCH', body),
      "Impossible de modifier l'indicateur",
    ),

  reorderIndicators: ({
    setId,
    ids,
  }: {
    setId: string
    ids: string[]
  }): Promise<unknown> =>
    ecrire(
      `/${setId}/indicators/order`,
      send('PUT', { ids }),
      'Impossible de réordonner les indicateurs',
    ),

  catalog: async (): Promise<MeasureCatalogEntry[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/indicator-catalog`)
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de charger les mesures')
    }
    return await response.json()
  },

  // Le 400 d'une définition incomplète est attendu pendant la saisie : l'appelant l'affiche sans toast.
  preview: async (
    setId: string,
    indicator: IndicatorDefinition,
    from: string,
    to: string,
  ): Promise<IndicatorPreview> => {
    const response = await fetchWithAuth(
      url(`/${setId}/preview`),
      send('POST', { indicator, from, to }),
    )
    if (!response.ok) {
      handleHttpError(response, {}, "Impossible de calculer l'aperçu")
    }
    return await response.json()
  },

  activitySettings: async (): Promise<ActivitySettings> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/activity-settings`)
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible de charger les réglages de l'Activité",
      )
    }
    return await response.json()
  },

  updateActivitySettings: async (
    body: ActivitySettings,
  ): Promise<ActivitySettings> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/activity-settings`,
      send('PATCH', body),
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible d'enregistrer les réglages de l'Activité",
      )
    }
    return await response.json()
  },
}
