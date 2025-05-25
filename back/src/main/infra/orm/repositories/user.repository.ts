import type { IocContainer } from '../../../types/application/ioc'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'
import { hashPassword } from '../../../utils/hash'
import { Role } from '@prisma/client'
import type {
  UserEntityCreate,
  UserEntityRepo,
  UserRepositoryInterface,
} from '../../../types/infra/orm/repositories/user.repository.interface'

class UserRepository implements UserRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  async findById(userID: string): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { id: userID },
      })
    } catch (err) {
      throw this.errorHandler.errorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async findByEmail(email: string): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { email },
      })
    } catch (err) {
      throw this.errorHandler.errorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async create(input: UserEntityCreate): Promise<UserEntityRepo> {
    const { password, ...user } = input
    const { hash, salt } = hashPassword(password)
    try {
      return await this.prisma.user.create({
        data: {
          ...user,
          salt,
          password: hash,
          role: Role.NONE,
        },
      })
    } catch (err) {
      throw this.errorHandler.errorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }
}

export { UserRepository }
