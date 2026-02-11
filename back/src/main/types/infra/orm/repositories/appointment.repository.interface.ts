import type { Appointment, Prisma } from 'generated/prisma/client'

import type {
  AppointmentPatientEntityRepo,
  AppointmentPatientUpdateEntityRepo,
} from './appointmentPatient.repository.interface'
import type { PatientEntityRepo } from './patient.repository.interface'

export type AppointmentEntityRepo = Appointment
export type AppointmentWithPatientsRepo = AppointmentEntityRepo & {
  appointmentPatients: (AppointmentPatientEntityRepo & {
    patient: PatientEntityRepo
  })[]
}
export type AppointmentCreateEntityRepo =
  Prisma.AppointmentUncheckedCreateInput & {
    slotID: string
    patientIDs: string[]
  }
export type AppointmentUpdateEntityRepo =
  Prisma.AppointmentUncheckedUpdateInput & {
    slotID?: string
    appointmentPatients: AppointmentPatientUpdateEntityRepo[]
  }

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
  addPatientToAppointment: (
    appointmentPatientUpdateParams: AppointmentPatientUpdateEntityRepo,
  ) => Promise<AppointmentPatientEntityRepo>
  delete: (appointmentID: string) => Promise<AppointmentEntityRepo>
  deleteOrphanedByIds: (appointmentIDs: string[]) => Promise<number>
}
