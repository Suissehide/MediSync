import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { ActivityLogsResponse } from '../types/activityLog.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export type GetActivityLogsParams = {
  page?: number
  action?: string
  userID?: string
  from?: string
}

export const ActivityLogApi = {
  getAll: async (params: GetActivityLogsParams = {}): Promise<ActivityLogsResponse> => {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.action) query.set('action', params.action)
    if (params.userID) query.set('userID', params.userID)
    if (params.from) query.set('from', params.from)
    const response = await fetchWithAuth(`${apiUrl}/activity-log?${query}`, { method: 'GET' })
    if (!response.ok) handleHttpError(response, {}, "Impossible de récupérer les logs d'activité")
    return response.json()
  },

  cleanup: async (): Promise<{ deleted: number }> => {
    const response = await fetchWithAuth(`${apiUrl}/activity-log/cleanup`, { method: 'POST' })
    if (!response.ok) handleHttpError(response, {}, 'Impossible de nettoyer les logs')
    return response.json()
  },
}
