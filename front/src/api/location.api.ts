import { establishmentApiUrl, tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateLocationParams,
  Location,
  UpdateLocationParams,
} from '../types/location.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const LocationApi = {
  getAll: async (): Promise<Location[]> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/location?action=getAllLocations`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des salles',
      )
    }
    return response.json()
  },

  // Même liste, par le préfixe d'administration : l'écran Salles vit à
  // l'échelle de l'établissement (navigation par échelle, 2026-09-28), sans
  // service en contexte (`tenantApiUrl` y lève). Le back renvoie le même
  // ensemble ; seule la permission exigée diffère (`locations:manage`).
  getAllForEstablishment: async (): Promise<Location[]> => {
    const response = await fetchWithAuth(`${establishmentApiUrl()}/location`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des salles',
      )
    }
    return response.json()
  },

  create: async (
    createLocationParams: CreateLocationParams,
  ): Promise<Location> => {
    const response = await fetchWithAuth(
      `${establishmentApiUrl()}/location?action=createLocation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createLocationParams),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une salle')
    }
    return response.json()
  },

  update: async (
    updateLocationParams: UpdateLocationParams,
  ): Promise<Location> => {
    const { id: locationID, ...updateLocationInputs } = updateLocationParams
    const response = await fetchWithAuth(
      `${establishmentApiUrl()}/location/${locationID}?action=updateLocation`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateLocationInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la salle')
    }
    return response.json()
  },

  delete: async (locationID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${establishmentApiUrl()}/location/${locationID}?action=deleteLocation`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la salle')
    }
    return
  },
}
