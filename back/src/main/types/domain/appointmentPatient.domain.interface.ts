import type { AppointmentPatient } from 'generated/prisma/client'
import type { AppointmentPatientUpdateEntityRepo } from '../infra/orm/repositories/appointmentPatient.repository.interface'
import type { AppointmentEntityDomain } from './appointment.domain.interface'

export type AppointmentPatientEntityDomain = AppointmentPatient
export type AppointmentPatientWithAppointmentDomain =
  AppointmentPatientEntityDomain & {
    appointment: AppointmentEntityDomain
  }

export type AppointmentPatientUpdateEntityDomain = Pick<
  AppointmentPatientUpdateEntityRepo,
  'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & { id?: string; patientID?: string }
