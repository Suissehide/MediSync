import type { Patient, Prisma } from '@prisma/client'

export type PatientEntityDomain = Patient
export type PatientCreateEntityDomain = Omit<
  Prisma.PatientUncheckedCreateInput,
  'createDate'
>
export type PatientUpdateEntityDomain = Omit<
  Prisma.PatientUncheckedUpdateInput,
  'createDate'
>

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
