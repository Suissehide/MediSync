import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { ServiceMember } from '../types/serviceMember.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Membres du service courant (2026-09-29). Lecture pour tout membre du service
// (`members:read`) ; le rattachement a un soignant, pour le coordinateur
// (`referentials:write`). Sous le prefixe de service : c'est le seul endroit ou les
// soignants, propres a chaque service, sont lisibles.
export const ServiceMembersApi = {
  getAll: async (): Promise<ServiceMember[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/membres`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les membres du service',
      )
    }
    return response.json()
  },

  // `affectationId` : l'identifiant de l'affectation de service (la ligne renvoyee par
  // `getAll`), pas celui du compte.
  setSoignant: async ({
    affectationId,
    soignantId,
  }: {
    affectationId: string
    soignantId: string | null
  }): Promise<ServiceMember> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/membres/${affectationId}/soignant`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soignantId }),
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de rattacher ce compte au soignant',
      )
    }
    return response.json()
  },
}
