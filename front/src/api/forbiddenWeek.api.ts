import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { ForbiddenWeek } from '../types/forbiddenWeek.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const ForbiddenWeekApi = {
  getAll: async (): Promise<ForbiddenWeek[]> => {
    const response = await fetchWithAuth(`${apiUrl}/forbidden-week`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les semaines interdites')
    }
    return response.json()
  },

  create: async (date: string): Promise<ForbiddenWeek> => {
    const response = await fetchWithAuth(`${apiUrl}/forbidden-week`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer la semaine interdite')
    }
    return response.json()
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetchWithAuth(`${apiUrl}/forbidden-week/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la semaine interdite')
    }
  },
}
