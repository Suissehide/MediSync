import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type { PatientDomainInterface } from '../types/domain/patient.domain.interface'
import type { PatientRepositoryInterface } from '../types/infra/orm/repositories/patient.repository.interface'
import type {
  PatientCreateEntityDomain,
  PatientEntityDomain,
  PatientUpdateEntityDomain,
} from '../types/domain/patient.domain.interface'

class PatientDomain implements PatientDomainInterface {
  private readonly logger: Logger
  private readonly patientRepository: PatientRepositoryInterface

  constructor({ patientRepository, logger }: IocContainer) {
    this.patientRepository = patientRepository
    this.logger = logger
  }

  findAll(): Promise<PatientEntityDomain[]> {
    return this.patientRepository.findAll()
  }

  findByID(patientID: string): Promise<PatientEntityDomain> {
    return this.patientRepository.findByID(patientID)
  }

  create(
    patientCreateParams: PatientCreateEntityDomain,
  ): Promise<PatientEntityDomain> {
    const patientInputParams = {
      ...patientCreateParams,
      createDate: new Date().toISOString(),
    }
    return this.patientRepository.create(patientInputParams)
  }

  update(
    patientID: string,
    patientUpdateParams: PatientUpdateEntityDomain,
  ): Promise<PatientEntityDomain> {
    return this.patientRepository.update(patientID, patientUpdateParams)
  }

  delete(patientID: string): Promise<PatientEntityDomain> {
    return this.patientRepository.delete(patientID)
  }
}

export { PatientDomain }
