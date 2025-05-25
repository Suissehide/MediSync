import type { Appointment } from '@prisma/client'

export type AppointmentEntityRepo = Appointment

export interface AppointmentRepositoryInterface {
  findByID: (id: string) => Promise<AppointmentEntityRepo>
}
