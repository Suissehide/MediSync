import { tenantApiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateSlotParams,
  Slot,
  SlotQuery,
  UpdateSlotParams,
} from '../types/slot.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const SlotApi = {
  getAll: async (query?: SlotQuery): Promise<Slot[]> => {
    const params = new URLSearchParams({ action: 'getAllSlots' })
    if (query?.from) {
      params.set('from', query.from)
    }
    if (query?.to) {
      params.set('to', query.to)
    }
    if (query?.patientID) {
      params.set('patientID', query.patientID)
    }
    const response = await fetchWithAuth(`${tenantApiUrl()}/slot?${params}`, {
      method: 'GET',
    })
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des créneaux',
      )
    }
    return response.json()
  },

  getByID: async (slotID: string): Promise<Slot> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/slot/${slotID}?action=getSlotByID`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        `Impossible de récupérer le créneau avec l'id : ${slotID}`,
      )
    }
    return response.json()
  },

  create: async (createSlotParams: CreateSlotParams): Promise<Slot> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/slot?action=createSlot`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSlotParams),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer un créneau')
    }
    return response.json()
  },

  update: async (updateSlotParams: UpdateSlotParams): Promise<Slot> => {
    const { id: slotID, ...updateSlotInputs } = updateSlotParams
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/slot/${slotID}?action=updateSlot`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateSlotInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le créneau')
    }
    return response.json()
  },

  delete: async (slotID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${tenantApiUrl()}/slot/${slotID}?action=deleteSlot`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le créneau')
    }
    return
  },
}
