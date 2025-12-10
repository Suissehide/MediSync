import type { AppointmentPatient } from '@prisma/client'

import type { AppointmentPatientUpdateEntityRepo } from '../infra/orm/repositories/appointmentPatient.repository.interface'

export type AppointmentPatientEntityDomain = AppointmentPatient

export type AppointmentPatientUpdateEntityDomain = Pick<
  AppointmentPatientUpdateEntityRepo,
  'accompanying' | 'status' | 'rejectionReason' | 'transmissionNotes'
> & { id?: string; patientID?: string }
