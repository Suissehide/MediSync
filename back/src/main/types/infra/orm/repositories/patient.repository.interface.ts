import type { Patient, Prisma } from '@prisma/client'

export type PatientEntityRepo = Patient
export type PatientCreateEntityRepo = Prisma.PatientUncheckedCreateInput
export type PatientUpdateEntityRepo = Prisma.PatientUncheckedUpdateInput

export interface PatientRepositoryInterface {
  findAll: () => Promise<PatientEntityRepo[]>
  findByID: (id: string) => Promise<PatientEntityRepo>
  create: (
    patientCreateParams: PatientCreateEntityRepo,
  ) => Promise<PatientEntityRepo>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityRepo,
  ) => Promise<PatientEntityRepo>
  delete: (patientID: string) => Promise<PatientEntityRepo>
}
