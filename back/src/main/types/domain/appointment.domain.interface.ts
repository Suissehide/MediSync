import type { Appointment, Prisma } from '@prisma/client'

export type AppointmentEntityDomain = Appointment
export type AppointmentCreateEntityDomain =
  Prisma.AppointmentUncheckedCreateInput
export type AppointmentUpdateEntityDomain =
  Prisma.AppointmentUncheckedUpdateInput

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
