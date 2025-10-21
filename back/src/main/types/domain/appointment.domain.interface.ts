import type { Appointment } from '@prisma/client'
import type {
  AppointmentCreateEntityRepo,
  AppointmentUpdateEntityRepo,
} from '../infra/orm/repositories/appointment.repository.interface'
import type { PatientEntityDomain } from './patient.domain.interface'

export type AppointmentEntityDomain = Appointment
export type AppointmentWithPatients = AppointmentEntityDomain & {
  patients: PatientEntityDomain[]
}
export type AppointmentCreateEntityDomain = Pick<
  AppointmentCreateEntityRepo,
  'startDate' | 'endDate' | 'type' | 'thematic' | 'transmissionNotes'
> & { slotID: string; patientIDs: string[] }
export type AppointmentUpdateEntityDomain = Pick<
  AppointmentUpdateEntityRepo,
  | 'startDate'
  | 'endDate'
  | 'type'
  | 'thematic'
  | 'transmissionNotes'
  | 'status'
  | 'rejectionReason'
  | 'accompanying'
> & { slotID?: string; patientIDs: string[] }

export interface AppointmentDomainInterface {
  findAll: () => Promise<AppointmentEntityDomain[]>
  findByID: (appointmentID: string) => Promise<AppointmentEntityDomain>
  create: (
    appointmentCreateParams: AppointmentCreateEntityDomain,
  ) => Promise<AppointmentEntityDomain>
  update: (
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
  ) => Promise<AppointmentEntityDomain>
  delete: (appointmentID: string) => Promise<AppointmentEntityDomain>
}
