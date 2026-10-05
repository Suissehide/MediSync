import {
  establishmentApiUrl,
  tenantApiUrl,
} from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { ActivityLogsResponse } from '../types/activityLog.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export type GetActivityLogsParams = {
  page?: number
  pageSize?: number
  // Recherche d'un auteur par son nom, faite par le serveur sur tout le journal.
  user?: string
  action?: string
  userID?: string
  from?: string
  // Navigation par échelle (2026-09-28) : le journal couvre tout l'établissement ; ce filtre le
  // resserre à un service.
  serviceId?: string
  // Le journal du seul service courant (chef de service), sous le prefixe de service.
  echelle?: 'service' | 'establishment'
}

export const ActivityLogApi = {
  getAll: async (
    params: GetActivityLogsParams = {},
  ): Promise<ActivityLogsResponse> => {
    const query = new URLSearchParams()
    if (params.page) {
      query.set('page', String(params.page))
    }
    if (params.pageSize) {
      query.set('pageSize', String(params.pageSize))
    }
    if (params.user) {
      query.set('user', params.user)
    }
    if (params.action) {
      query.set('action', params.action)
    }
    if (params.userID) {
      query.set('userID', params.userID)
    }
    if (params.from) {
      query.set('from', params.from)
    }
    if (params.serviceId) {
      query.set('serviceId', params.serviceId)
    }
    const response = await fetchWithAuth(
      `${params.echelle === 'service' ? tenantApiUrl() : establishmentApiUrl()}/activity-log?${query}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible de récupérer les logs d'activité",
      )
    }
    return response.json()
  },

  cleanup: async (
    params: { serviceId?: string } = {},
  ): Promise<{ deleted: number }> => {
    const query = new URLSearchParams()
    if (params.serviceId) {
      query.set('serviceId', params.serviceId)
    }
    const response = await fetchWithAuth(
      `${establishmentApiUrl()}/activity-log/cleanup?${query}`,
      { method: 'POST' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de nettoyer les logs')
    }
    return response.json()
  },
}
