import type { PostgresPrismaClient } from '../postgres-client'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { IocContainer } from '../../../types/application/ioc'
import type { PatientRepositoryInterface } from '../../../types/infra/orm/repositories/patient.repository.interface'

class PatientRepository implements PatientRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }
}

export { PatientRepository }
