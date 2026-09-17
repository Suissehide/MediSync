import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { PlanningCycle } from '../types/planningCycle.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PlanningCycleApi = {
  get: async (): Promise<PlanningCycle | null> => {
    const response = await fetchWithAuth(`${apiUrl}/planning-cycle`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer le cycle de semaines',
      )
    }
    return response.json()
  },

  save: async (cycle: PlanningCycle): Promise<PlanningCycle> => {
    const response = await fetchWithAuth(`${apiUrl}/planning-cycle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cycle),
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible d\'enregistrer le cycle de semaines',
      )
    }
    return response.json()
  },

  reset: async (): Promise<void> => {
    const response = await fetchWithAuth(`${apiUrl}/planning-cycle`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de réinitialiser le cycle de semaines',
      )
    }
  },
}
