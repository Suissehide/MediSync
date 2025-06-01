import type {Appointment, Prisma} from '@prisma/client'

export type AppointmentEntityRepo = Appointment
export type AppointmentCreateEntityRepo = Prisma.AppointmentUncheckedCreateInput
export type AppointmentUpdateEntityRepo = Prisma.AppointmentUncheckedUpdateInput

export interface AppointmentRepositoryInterface {
  findAll: () => Promise<AppointmentEntityRepo[]>
  findByID: (id: string) => Promise<AppointmentEntityRepo>
  create: (
    appointmentCreateParams: AppointmentCreateEntityRepo,
  ) => Promise<AppointmentEntityRepo>
  update: (
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityRepo,
  ) => Promise<AppointmentEntityRepo>
  delete: (appointmentID: string) => Promise<AppointmentEntityRepo>
}
