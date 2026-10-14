import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { PdfDesignList } from '../types/pdfDesignList.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PdfDesignApi = {
  getAll: async (): Promise<PdfDesignList> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/pdf-designs`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les designs de PDF',
      )
    }
    return response.json()
  },
}
