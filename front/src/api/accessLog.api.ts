import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { PatientAccessLogResponse } from '../types/accessLog.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// URL composée par `tenantApiUrl()`, comme les autres modules de ce dossier : le contexte
// établissement/service est implicite, lu dans le store au moment de l'appel — jamais un
// argument de cette fonction (`front/CLAUDE.md` § « Le contexte est implicite »). `patientID`
// n'est pas le tenant : c'est l'identifiant de la ressource consultée, comme dans
// `PatientServiceFileApi.getByPatient`.
// Pagination (2026-10-01) : `page`/`pageSize` sont des DONNÉES de la requête, jamais un tenant —
// le back pose les défauts (1 et 50) quand elles sont absentes, comme pour les deux autres journaux.
export type GetPatientAccessLogParams = {
  page?: number
  pageSize?: number
}

export const AccessLogApi = {
  getByPatient: async (
    patientID: string,
    params: GetPatientAccessLogParams = {},
  ): Promise<PatientAccessLogResponse> => {
    const query = new URLSearchParams()
    if (params.page) {
      query.set('page', String(params.page))
    }
    if (params.pageSize) {
      query.set('pageSize', String(params.pageSize))
    }
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/patient/${patientID}/acces?${query}`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer le journal des accès à ce dossier',
      )
    }
    return response.json()
  },
}
