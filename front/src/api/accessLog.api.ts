import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { PatientAccessLogEntry } from '../types/accessLog.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// URL composée par `tenantApiUrl()`, comme les autres modules de ce dossier : le contexte
// établissement/service est implicite, lu dans le store au moment de l'appel — jamais un
// argument de cette fonction (`front/CLAUDE.md` § « Le contexte est implicite »). `patientID`
// n'est pas le tenant : c'est l'identifiant de la ressource consultée, comme dans
// `PatientServiceFileApi.getByPatient`.
export const AccessLogApi = {
  getByPatient: async (patientID: string): Promise<PatientAccessLogEntry[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/patient/${patientID}/acces`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer le journal des accès à ce dossier')
    }
    return response.json()
  },
}
