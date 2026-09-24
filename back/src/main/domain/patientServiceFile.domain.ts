import type { IocContainer } from '../types/application/ioc'
import type {
  PatientServiceFileDomainInterface,
  PatientServiceFileEntityDomain,
  PatientServiceFileUpsertEntityDomain,
} from '../types/domain/patientServiceFile.domain.interface'
import type { PatientServiceFileRepositoryInterface } from '../types/infra/orm/repositories/patientServiceFile.repository.interface'

class PatientServiceFileDomain implements PatientServiceFileDomainInterface {
  private readonly patientServiceFileRepository: PatientServiceFileRepositoryInterface

  constructor({ patientServiceFileRepository }: IocContainer) {
    this.patientServiceFileRepository = patientServiceFileRepository
  }

  findByPatient(patientId: string): Promise<PatientServiceFileEntityDomain | null> {
    return this.patientServiceFileRepository.findByPatient(patientId)
  }

  upsert(
    patientId: string,
    params: PatientServiceFileUpsertEntityDomain,
  ): Promise<PatientServiceFileEntityDomain> {
    return this.patientServiceFileRepository.upsert(patientId, params)
  }
}

export { PatientServiceFileDomain }
