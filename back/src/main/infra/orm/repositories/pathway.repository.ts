import type { PostgresPrismaClient } from '../postgres-client'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { IocContainer } from '../../../types/application/ioc'
import type { PathwayRepositoryInterface } from '../../../types/infra/orm/repositories/pathway.repository.interface'

class PathwayRepository implements PathwayRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }
}

export { PathwayRepository }
