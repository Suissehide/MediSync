import type { Patient, Prisma } from '@prisma/client'

export type PatientEntityDomain = Patient
export type PatientCreateEntityDomain = Prisma.PatientUncheckedCreateInput
export type PatientUpdateEntityDomain = Prisma.PatientUncheckedUpdateInput

export interface PatientDomainInterface {
  findAll: () => Promise<PatientEntityDomain[]>
  findByID: (patientID: string) => Promise<PatientEntityDomain>
  create: (
    patientCreateParams: PatientCreateEntityDomain,
  ) => Promise<PatientEntityDomain>
  update: (
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
  ) => Promise<PatientEntityDomain>
  delete: (patientID: string) => Promise<PatientEntityDomain>
}
