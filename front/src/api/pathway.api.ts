import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreatePathwayParams,
  InstantiatePathwayParams,
  Pathway,
  UpdatePathwayParams,
} from '../types/pathway.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PathwayApi = {
  getAll: async (): Promise<Pathway[]> => {
    const response = await fetchWithAuth(`${apiUrl}/pathway`, {
      method: 'GET',
    })
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
    createPathwayParams: CreatePathwayParams,
  ): Promise<Pathway> => {
    const response = await fetchWithAuth(`${apiUrl}/pathway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPathwayParams),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une tâche')
    }
    return response.json()
  },

  instantiate: async (
    instantiatePathwayParams: InstantiatePathwayParams,
  ): Promise<Pathway> => {
    const response = await fetchWithAuth(`${apiUrl}/pathway/instantiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(instantiatePathwayParams),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une tâche')
    }
    return response.json()
  },

  update: async (
    updatePathwayParams: UpdatePathwayParams,
  ): Promise<Pathway> => {
    const { id: pathwayID, ...updatePathwayInputs } = updatePathwayParams
    const response = await fetchWithAuth(`${apiUrl}/pathway/${pathwayID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePathwayInputs),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la tâche')
    }
    return response.json()
  },

  delete: async (pathwayID: string): Promise<void> => {
    const response = await fetchWithAuth(`${apiUrl}/pathway/${pathwayID}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la tâche')
    }
    return
  },
}
