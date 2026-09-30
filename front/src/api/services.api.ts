import { establishmentApiUrl } from '@/constants/config.constant.ts'
import { handleHttpError } from '@/libs/httpErrorHandler.ts'
import type {
  CreateServiceInput,
  Service,
  ServiceDeactivationImpact,
  UpdateServiceInput,
} from '@/types/service.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

// Sous le préfixe d'établissement (`establishmentApiUrl`), comme
// `members.api.ts` : administration d'établissement, contexte sans service.
const SERVICES_URL = () => `${establishmentApiUrl()}/services`

// Renommer l'établissement courant (chef d'établissement) : `PATCH /e/:establishmentId/admin`.
export const renameCurrentEstablishment = async (
  name: string,
): Promise<void> => {
  const response = await fetchWithAuth(establishmentApiUrl(), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    handleHttpError(response, {}, "Impossible de renommer l'établissement")
  }
}

export const ServicesApi = {
  getAll: async (): Promise<Service[]> => {
    const response = await fetchWithAuth(SERVICES_URL(), { method: 'GET' })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de récupérer les services')
    }
    return response.json()
  },

  create: async (input: CreateServiceInput): Promise<Service> => {
    const response = await fetchWithAuth(SERVICES_URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer le service')
    }
    return response.json()
  },

  // Une seule route sert le renommage ET la (dés/ré)activation (back,
  // `services.ts`) : `{ name? }`, `{ deactivated? }`, ou les deux.
  update: async ({ id, ...input }: UpdateServiceInput): Promise<Service> => {
    const response = await fetchWithAuth(`${SERVICES_URL()}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le service')
    }
    return response.json()
  },

  // Appelée À LA DEMANDE, jamais pour toute la liste des services — voir
  // `back/CLAUDE.md` § « Multi-tenant » sur `impactDesactivation` (une
  // lecture inter-services, à coût et périmètre particuliers).
  impactDesactivation: async (
    id: string,
  ): Promise<ServiceDeactivationImpact> => {
    const response = await fetchWithAuth(
      `${SERVICES_URL()}/${id}/impact-desactivation`,
      { method: 'GET' },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        "Impossible de calculer l'impact de la désactivation",
      )
    }
    return response.json()
  },
}
