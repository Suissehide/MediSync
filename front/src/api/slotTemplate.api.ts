import { apiUrl } from '../constants/config.constant.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import type {
  CreateSlotTemplateParams,
  SlotTemplate,
  UpdateSlotTemplateParams,
} from '../types/slotTemplate.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const SlotTemplateApi = {
  getAll: async (): Promise<SlotTemplate[]> => {
    const response = await fetchWithAuth(
      `${apiUrl}/slot-template?action=getAllSlotTemplates`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des templates de créneau',
      )
    }
    return response.json()
  },

  getByID: async (slotTemplateID: string): Promise<SlotTemplate> => {
    const response = await fetchWithAuth(
      `${apiUrl}/slot-template/${slotTemplateID}?action=getSlotTemplateByID`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        'Impossible de récupérer le template de créneau',
      )
    }
    return response.json()
  },

  create: async (
    createSlotTemplateParams: CreateSlotTemplateParams,
  ): Promise<SlotTemplate> => {
    const response = await fetchWithAuth(
      `${apiUrl}/slot-template?action=createSlotTemplate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createSlotTemplateParams),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une tâche')
    }
    return response.json()
  },

  update: async (
    updateSlotTemplateParams: UpdateSlotTemplateParams,
  ): Promise<SlotTemplate> => {
    const { id: slotTemplateID, ...updateSlotTemplateInputs } =
      updateSlotTemplateParams
    const response = await fetchWithAuth(
      `${apiUrl}/slot-template/${slotTemplateID}?action=updateSlotTemplate`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateSlotTemplateInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la tâche')
    }
    return response.json()
  },

  delete: async (slotTemplateID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${apiUrl}/slot-template/${slotTemplateID}?action=deleteSlotTemplate`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la tâche')
    }
    return
  },
}
