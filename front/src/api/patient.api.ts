import { apiUrl } from '../constants/config.constant.ts'
import {
  ApiError,
  handleHttpError,
  isApiError,
} from '../libs/httpErrorHandler.ts'
import type {
  CreatePatientParams,
  Patient,
  UpdatePatientParams,
} from '../types/patient.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const PatientApi = {
  getAll: async (): Promise<Patient[]> => {
    try {
      const response = await fetchWithAuth(`${apiUrl}/patient`, {
        method: 'GET',
      })

      if (!response.ok) {
        handleHttpError(
          response,
          {},
          'Impossible de récupérer la liste des patients',
        )
      }
      return response.json()
    } catch (error) {
      if (isApiError(error)) {
        throw error
      }
      throw new ApiError(0, 'Impossible de récupérer la liste des patients')
    }
  },

  getByID: async (patientID: string): Promise<Patient> => {
    const response = await fetchWithAuth(
      `${apiUrl}/patient/${patientID}?action=getPatientByID`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      handleHttpError(
        response,
        {},
        `Impossible de récupérer le patient avec l'id : ${patientID}`,
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
      handleHttpError(response, {}, 'Impossible de créer un patient')
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
      handleHttpError(response, {}, 'Impossible de modifier le patient')
    }
    return response.json()
  },

  delete: async (patientID: string): Promise<void> => {
    const response = await fetchWithAuth(`${apiUrl}/patient/${patientID}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le patient')
    }
    return
  },
}
