import { establishmentApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type { EstablishmentGrant } from '@/types/grant.ts'

import { fetchWithAuth } from './fetchWithAuth.ts'

// `GET /e/:establishmentId/admin/grants` (back, `grants.ts`) : SEULE
// lecture, délibérément — c'est l'établissement qui voit qui dispose d'un
// accès chez lui, pas l'inverse (aucune route ne rend au super-admin la
// liste des octrois qu'il a lui-même émis, voir task-12-report.md).
const ESTABLISHMENT_GRANTS_URL = () => `${establishmentApiUrl()}/grants`

export const EstablishmentGrantsApi = {
  getAll: async (): Promise<EstablishmentGrant[]> => {
    const response = await fetchWithAuth(ESTABLISHMENT_GRANTS_URL(), {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les accès temporaires')
    }
    return response.json()
  },
}
