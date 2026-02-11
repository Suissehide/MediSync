import type {
  Patient,
  Prisma,
} from 'generated/prisma/client'
import type { PatientWithAppointmentsDomain } from '../../../domain/patient.domain.interface'

export type PatientEntityRepo = Patient
export type PatientCreateEntityRepo = Prisma.PatientUncheckedCreateInput
export type PatientUpdateEntityRepo = Prisma.PatientUncheckedUpdateInput

export interface PatientRepositoryInterface {
  findAll: () => Promise<PatientEntityRepo[]>
  findByID: (id: string) => Promise<PatientWithAppointmentsDomain>
  create: (
    patientCreateParams: PatientCreateEntityRepo,
  ) => Promise<PatientEntityRepo>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityRepo,
  ) => Promise<PatientEntityRepo>
  delete: (patientID: string) => Promise<PatientEntityRepo>
}
