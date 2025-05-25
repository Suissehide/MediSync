import type { AppointmentEntityRepo } from '../infra/orm/repositories/appointment.repository.interface'

export type AppointmentEntityDomain = AppointmentEntityRepo

export type AppointmentDomainInterface = {
  findByID: (id: string) => Promise<AppointmentEntityDomain>
}
