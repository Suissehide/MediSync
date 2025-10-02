import type {
  CreateSoignantParams,
  Soignant,
  UpdateSoignantParams,
} from '../types/soignant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import { apiUrl } from '../constants/config.constant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const SoignantApi = {
  getAll: async (): Promise<Soignant[]> => {
    const response = await fetchWithAuth(
      `${apiUrl}/soignant?action=getAllSoignants`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      console.log('error')
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des tâches',
      )
    }
    return response.json()
  },

  create: async (
    createSoignantParams: CreateSoignantParams,
  ): Promise<Soignant> => {
    const response = await fetchWithAuth(
      `${apiUrl}/soignant?action=createSoignant`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSoignantParams),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une tâche')
    }
    return response.json()
  },

  update: async (
    updateSoignantParams: UpdateSoignantParams,
  ): Promise<Soignant> => {
    const { id: soignantID, ...updateSoignantInputs } = updateSoignantParams
    const response = await fetchWithAuth(
      `${apiUrl}/soignant/${soignantID}?action=updateSoignant`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateSoignantInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la tâche')
    }
    return response.json()
  },

  delete: async (soignantID: string): Promise<Soignant> => {
    const response = await fetchWithAuth(
      `${apiUrl}/soignant/${soignantID}?action=deleteSoignant`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la tâche')
    }
    return response.json()
  },
}
