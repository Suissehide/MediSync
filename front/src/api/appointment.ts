import type {
  CreateAppointmentParams,
  Appointment,
  UpdateAppointmentParams,
} from '../types/appointment.ts'
import { handleHttpError } from '../libs/httpErrorHandler.ts'
import { apiUrl } from '../constants/config.constant.ts'
import { fetchWithAuth } from './fetchWithAuth.ts'

export const AppointmentApi = {
  getAll: async (): Promise<Appointment[]> => {
    const response = await fetchWithAuth(
      `${apiUrl}/appointment?action=getAllAppointments`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      console.log('error')
      handleHttpError(
        response,
        {},
        'Impossible de récupérer la liste des rendez-vous',
      )
    }
    return response.json()
  },

  getByID: async (appointmentID: string): Promise<Appointment> => {
    const response = await fetchWithAuth(
      `${apiUrl}/appointment/${appointmentID}?action=getAppointmentByID`,
      {
        method: 'GET',
      },
    )
    if (!response.ok) {
      console.log('error')
      handleHttpError(
        response,
        {},
        `Impossible de récupérer le rendez-vous avec l\'id : ${appointmentID}`,
      )
    }
    return response.json()
  },

  create: async (
    createAppointmentParams: CreateAppointmentParams,
  ): Promise<Appointment> => {
    const response = await fetchWithAuth(
      `${apiUrl}/appointment?action=createAppointment`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createAppointmentParams),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de créer un rendez-vous')
    }
    return response.json()
  },

  update: async (
    updateAppointmentParams: UpdateAppointmentParams,
  ): Promise<Appointment> => {
    const { id: appointmentID, ...updateAppointmentInputs } =
      updateAppointmentParams
    const response = await fetchWithAuth(
      `${apiUrl}/appointment/${appointmentID}?action=updateAppointment`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateAppointmentInputs),
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de modifier le rendez-vous')
    }
    return response.json()
  },

  delete: async (appointmentID: string): Promise<void> => {
    const response = await fetchWithAuth(
      `${apiUrl}/appointment/${appointmentID}?action=deleteAppointment`,
      {
        method: 'DELETE',
      },
    )
    if (!response.ok) {
      handleHttpError(response, {}, 'Impossible de supprimer le rendez-vous')
    }
    return
  },
}
