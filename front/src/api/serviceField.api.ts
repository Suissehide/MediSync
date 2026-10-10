import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateServiceFieldChoiceParams,
  CreateServiceFieldParams,
  ReorderServiceFieldChoicesParams,
  ReorderServiceFieldsParams,
  ServiceField,
  UpdateServiceFieldChoiceParams,
  UpdateServiceFieldParams,
} from '../types/serviceField.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const ServiceFieldApi = {
  getAll: async (): Promise<ServiceField[]> => {
    const response = await fetchWithAuth(`${tenantApiUrl()}/service-fields`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer les champs de la fiche patient',
      )
    }
    return response.json()
  },

  create: async (params: CreateServiceFieldParams): Promise<ServiceField> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/service-fields`,
      send('POST', params),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer le champ')
    }
    return response.json()
  },

  update: async ({
    id,
    ...body
  }: UpdateServiceFieldParams): Promise<ServiceField> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/service-fields/${id}`,
      send('PATCH', body),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le champ')
    }
    return response.json()
  },

  createChoice: async ({
    fieldID,
    label,
  }: CreateServiceFieldChoiceParams): Promise<ServiceField> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/service-fields/${fieldID}/choices`,
      send('POST', { label }),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible d’ajouter le choix')
    }
    return response.json()
  },

  updateChoice: async ({
    fieldID,
    choiceID,
    ...body
  }: UpdateServiceFieldChoiceParams): Promise<ServiceField> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/service-fields/${fieldID}/choices/${choiceID}`,
      send('PATCH', body),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le choix')
    }
    return response.json()
  },

  reorder: async (params: ReorderServiceFieldsParams): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/service-fields/order`,
      send('PUT', params),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de réordonner les champs')
    }
  },

  reorderChoices: async ({
    fieldID,
    ids,
  }: ReorderServiceFieldChoicesParams): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/service-fields/${fieldID}/choices/order`,
      send('PUT', { ids }),
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de réordonner les choix')
    }
  },
}
