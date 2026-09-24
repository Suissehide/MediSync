import { establishmentApiUrl, tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateSoignantParams,
  Soignant,
  UpdateSoignantParams,
} from '../types/soignant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const SoignantApi = {
  getAll: async (): Promise<Soignant[]> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/soignant?action=getAllSoignants`,
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

  // Même liste, mais par le préfixe d'établissement : à utiliser depuis un
  // écran sans service en contexte (`tenantApiUrl` y lève), comme l'écran
  // des membres. Le back renvoie le même ensemble dans les deux cas (le
  // repository filtre par établissement, jamais par service), seule la
  // permission exigée diffère (`soignants:manage`, pas `referentials:read`).
  getAllForEstablishment: async (): Promise<Soignant[]> => {
    const response = await fetchWithAuth(`${establishmentApiUrl()}/soignant`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des soignants',
      )
    }
    return response.json()
  },

  create: async (
    createSoignantParams: CreateSoignantParams,
  ): Promise<Soignant> => {
    const response = await fetchWithAuth(
      `${establishmentApiUrl()}/soignant?action=createSoignant`,
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
      `${establishmentApiUrl()}/soignant/${soignantID}?action=updateSoignant`,
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

  delete: async (soignantID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${establishmentApiUrl()}/soignant/${soignantID}?action=deleteSoignant`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la tâche')
    }
    return
  },
}
