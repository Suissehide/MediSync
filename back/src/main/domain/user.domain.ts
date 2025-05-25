import type {
  UserDomainInterface,
  UserEntityDomain,
} from '../types/domain/user.domain.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { PostgresPrismaClient } from '../infra/orm/postgres-client'
import type { ErrorHandlerInterface } from '../types/utils/error-handler'
import type { IocContainer } from '../types/application/ioc'

class UserDomain implements UserDomainInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly userRepository: UserRepositoryInterface

  constructor({ postgresOrm, errorHandler, userRepository }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.userRepository = userRepository
  }

  findByID(userID: string): Promise<UserEntityDomain> {
    return this.userRepository.findById(userID)
  }
}

export { UserDomain }
