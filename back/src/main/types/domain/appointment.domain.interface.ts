import type { Appointment } from '@prisma/client'
import type {
  AppointmentCreateEntityRepo,
  AppointmentUpdateEntityRepo,
} from '../infra/orm/repositories/appointment.repository.interface'

export type AppointmentEntityDomain = Appointment
export type AppointmentCreateEntityDomain = Pick<
  AppointmentCreateEntityRepo,
  'startDate' | 'endDate'
> & { slotID: string }
export type AppointmentUpdateEntityDomain = Pick<
  AppointmentUpdateEntityRepo,
  'startDate' | 'endDate'
> & { slotID?: string }

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
