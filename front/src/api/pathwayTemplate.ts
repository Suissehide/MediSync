import type {
  CreatePathwayTemplateParams,
  PathwayTemplate,
  UpdatePathwayTemplateParams,
} from '../types/pathwayTemplate.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import { apiUrl } from '../constants/config.constant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PathwayTemplateApi = {
  getAll: async (): Promise<PathwayTemplate[]> => {
    const response = await fetchWithAuth(
      `${apiUrl}/pathway-template?action=getAllPathwayTemplates`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      console.log('error')
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des templates de parcours',
      )
    }
    return response.json()
  },

  create: async (
    createPathwayTemplateParams: CreatePathwayTemplateParams,
  ): Promise<PathwayTemplate> => {
    const response = await fetchWithAuth(
      `${apiUrl}/pathway-template?action=createPathwayTemplate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPathwayTemplateParams),
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de créer un template de parcours',
      )
    }
    return response.json()
  },

  update: async (
    updatePathwayTemplateParams: UpdatePathwayTemplateParams,
  ): Promise<PathwayTemplate> => {
    const { id: pathwayTemplateID, ...updatePathwayTemplateInputs } =
      updatePathwayTemplateParams
    const response = await fetchWithAuth(
      `${apiUrl}/pathway-template/${pathwayTemplateID}?action=updatePathwayTemplate`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePathwayTemplateInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de modifier le template de parcours',
      )
    }
    return response.json()
  },

  delete: async (pathwayTemplateID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${apiUrl}/pathway-template/${pathwayTemplateID}?action=deletePathwayTemplate`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de supprimer le template de parcours',
      )
    }
    return
  },
}
