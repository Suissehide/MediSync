import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError, messageDuServeur } from '../libs/httpErrorHandler.ts'
import type {
  CreateSoignantParams,
  Soignant,
  UpdateSoignantParams,
} from '../types/soignant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const SoignantApi = {
  // `baseUrl` : un autre service que le courant (paramètres du compte).
  getAll: async (
    baseUrl = tenantApiUrl(),
    archived = false,
  ): Promise<Soignant[]> => {
    const response = await fetchWithAuth(
      `${baseUrl}/soignant?action=getAllSoignants&archived=${archived}`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
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
      `${tenantApiUrl()}/soignant?action=createSoignant`,
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
      `${tenantApiUrl()}/soignant/${soignantID}?action=updateSoignant`,
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

  archive: async (soignantID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/soignant/${soignantID}?action=archiveSoignant`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible d’archiver le soignant')
    }
    return
  },

  deleteForever: async (soignantID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/soignant/${soignantID}/definitive`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      const message = await messageDuServeur(response)
      handleHttpError(
        response,
        message ? { 409: { title: 'Suppression impossible', message } } : {},
        'Impossible de supprimer définitivement le soignant',
      )
    }
    return
  },
}
