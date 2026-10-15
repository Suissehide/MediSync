import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreatePdfDesignParams,
  PdfDesignList,
  PdfDesignSummary,
  UpdatePdfDesignParams,
} from '../types/pdfDesignList.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PdfDesignApi = {
  getAll: async (archived = false): Promise<PdfDesignList> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-designs?archived=${archived}`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les designs de PDF',
      )
    }
    return response.json()
  },

  create: async (params: CreatePdfDesignParams): Promise<PdfDesignSummary> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-designs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer le design')
    }
    return response.json()
  },

  // L'identifiant reste dans le chemin : le corps ne porte que ce qui change.
  update: async ({
    id,
    ...champs
  }: UpdatePdfDesignParams): Promise<PdfDesignSummary> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-designs/${id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(champs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le design')
    }
    return response.json()
  },

  archive: async (designID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/pdf-designs/${designID}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le design')
    }
  },
}
