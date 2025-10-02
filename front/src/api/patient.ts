import type {
  CreatePatientParams,
  Patient,
  UpdatePatientParams,
} from '../types/patient.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import { apiUrl } from '../constants/config.constant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PatientApi = {
  getAll: async (): Promise<Patient[]> => {
    const response = await fetchWithAuth(`${apiUrl}/patient`, {
      method: 'GET',
    })
    if (!response.ok) {
      console.log('error')
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des tâches',
      )
    }
    return response.json()
  },

  create: async (
    createPatientParams: CreatePatientParams,
  ): Promise<Patient> => {
    const response = await fetchWithAuth(`${apiUrl}/patient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPatientParams),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer une tâche')
    }
    return response.json()
  },

  update: async (
    updatePatientParams: UpdatePatientParams,
  ): Promise<Patient> => {
    const { id: patientID, ...updatePatientInputs } = updatePatientParams
    const response = await fetchWithAuth(`${apiUrl}/patient/${patientID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePatientInputs),
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier la tâche')
    }
    return response.json()
  },

  delete: async (patientID: string): Promise<Patient> => {
    const response = await fetchWithAuth(`${apiUrl}/patient/${patientID}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer la tâche')
    }
    return response.json()
  },
}
