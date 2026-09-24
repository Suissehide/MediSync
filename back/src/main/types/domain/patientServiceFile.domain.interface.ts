import type {
  PatientServiceFileEntityRepo,
  PatientServiceFileUpsertEntityRepo,
} from '../infra/orm/repositories/patientServiceFile.repository.interface'

export type PatientServiceFileEntityDomain = PatientServiceFileEntityRepo
export type PatientServiceFileUpsertEntityDomain = PatientServiceFileUpsertEntityRepo

export interface PatientServiceFileDomainInterface {
  findByPatient: (patientId: string) => Promise<PatientServiceFileEntityDomain | null>
  upsert: (
    patientId: string,
    params: PatientServiceFileUpsertEntityDomain,
  ) => Promise<PatientServiceFileEntityDomain>
}
