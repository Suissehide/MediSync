import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateThematicParams,
  Thematic,
  UpdateThematicParams,
} from '../types/thematic.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const ThematicApi = {
  getAll: async (): Promise<Thematic[]> => {
    const response = await fetchWithAuth(
      `${apiUrl}/thematic?action=getAllThematics`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des thématiques',
      )
    }
    return response.json()
  },

  create: async (
    createThematicParams: CreateThematicParams,
  ): Promise<Thematic> => {
    const response = await fetchWithAuth(
      `${apiUrl}/thematic?action=createThematic`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createThematicParams),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une thématique')
    }
    return response.json()
  },

  update: async (
    updateThematicParams: UpdateThematicParams,
  ): Promise<Thematic> => {
    const { id: thematicID, ...updateThematicInputs } = updateThematicParams
    const response = await fetchWithAuth(
      `${apiUrl}/thematic/${thematicID}?action=updateThematic`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateThematicInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la thématique')
    }
    return response.json()
  },

  delete: async (thematicID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${apiUrl}/thematic/${thematicID}?action=deleteThematic`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la thématique')
    }
    return
  },
}
