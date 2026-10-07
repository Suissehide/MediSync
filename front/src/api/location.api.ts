import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateLocationParams,
  Location,
  UpdateLocationParams,
} from '../types/location.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const LocationApi = {
  getAll: async (archived = false): Promise<Location[]> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/location?action=getAllLocations&archived=${archived}`,
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

  create: async (
    createLocationParams: CreateLocationParams,
  ): Promise<Location> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/location?action=createLocation`,
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
      `${tenantApiUrl()}/location/${locationID}?action=updateLocation`,
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

  archive: async (locationID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/location/${locationID}?action=archiveLocation`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible d’archiver la salle')
    }
    return
  },
}
