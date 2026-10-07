import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateThematicParams,
  Thematic,
  UpdateThematicParams,
} from '../types/thematic.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const ThematicApi = {
  getAll: async (archived = false): Promise<Thematic[]> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/thematic?action=getAllThematics&archived=${archived}`,
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
      `${tenantApiUrl()}/thematic?action=createThematic`,
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
      `${tenantApiUrl()}/thematic/${thematicID}?action=updateThematic`,
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

  archive: async (thematicID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/thematic/${thematicID}?action=archiveThematic`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible d’archiver la thématique')
    }
    return
  },
}
