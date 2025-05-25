import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type { PatientDomainInterface } from '../types/domain/patient.domain.interface'
import type { PatientRepositoryInterface } from '../types/infra/orm/repositories/patient.repository.interface'

class PatientDomain implements PatientDomainInterface {
  private readonly logger: Logger
  private readonly patientRepository: PatientRepositoryInterface

  constructor({ patientRepository, logger }: IocContainer) {
    this.patientRepository = patientRepository
    this.logger = logger
  }
}

export { PatientDomain }
