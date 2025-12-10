import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type { CreateSlotParams, Slot, UpdateSlotParams } from '../types/slot.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const SlotApi = {
  getAll: async (): Promise<Slot[]> => {
    const response = await fetchWithAuth(`${apiUrl}/slot?action=getAllSlots`, {
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
      `${apiUrl}/slot/${slotID}?action=getSlotByID`,
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
    const response = await fetchWithAuth(`${apiUrl}/slot?action=createSlot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createSlotParams),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer un créneau')
    }
    return response.json()
  },

  update: async (updateSlotParams: UpdateSlotParams): Promise<Slot> => {
    const { id: slotID, ...updateSlotInputs } = updateSlotParams
    const response = await fetchWithAuth(
      `${apiUrl}/slot/${slotID}?action=updateSlot`,
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
      `${apiUrl}/slot/${slotID}?action=deleteSlot`,
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
