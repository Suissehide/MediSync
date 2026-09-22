import type { AppointmentPatient } from '../../../generated/client'
import type { AppointmentPatientUpdateEntityRepo } from '../infra/orm/repositories/appointmentPatient.repository.interface'
import type { AppointmentEntityDomain } from './appointment.domain.interface'

export type AppointmentPatientEntityDomain = AppointmentPatient
export type AppointmentPatientWithAppointmentDomain =
  AppointmentPatientEntityDomain & {
    appointment: AppointmentEntityDomain
  }

// Miroir du type repository : `patientID` y est requis pour la même
// raison (jamais omis par les schémas HTTP correspondants), `id` reste
// optionnel (nouveau participant vs participant déjà inscrit).
export type AppointmentPatientUpdateEntityDomain = Pick<
  AppointmentPatientUpdateEntityRepo,
  'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & { id?: string; patientID: string }
