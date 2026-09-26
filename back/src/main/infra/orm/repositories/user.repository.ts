import type { IocContainer } from '../../../types/application/ioc'
import type {
  UserCreateEntityRepo,
  UserEntityRepo,
  UserProfileUpdateRepo,
  UserRepositoryInterface,
  UserWithMemberships,
} from '../../../types/infra/orm/repositories/user.repository.interface'
import type { PrimaTransactionClient } from '../../../types/infra/orm/client'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import { hashPassword } from '../../../utils/hash'
import type { PostgresPrismaClient } from '../postgres-client'

// Inclusion de l'arbre des appartenances (établissements puis services).
// Autorisée par le garde-fou tenant uniquement sur un findUnique(OrThrow) :
// voir GLOBAL_TENANT_RELATIONS dans tenant-guard.ts.
const membershipsInclude = {
  establishmentMemberships: {
    include: {
      establishment: true,
      serviceMemberships: { include: { service: true } },
    },
  },
} as const

class UserRepository implements UserRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  async findByID(userID: string): Promise<UserWithMemberships> {
    try {
      return await this.prisma.user.findUniqueOrThrow({
        where: { id: userID },
        include: membershipsInclude,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
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
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async create(
    input: UserCreateEntityRepo,
    client: PrimaTransactionClient = this.prisma,
  ): Promise<UserEntityRepo> {
    const { password, ...user } = input
    const { hash, salt } = hashPassword(password)
    try {
      return await client.user.create({
        data: {
          ...user,
          salt,
          password: hash,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async updateProfile(
    userID: string,
    params: UserProfileUpdateRepo,
  ): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.update({
        where: { id: userID },
        data: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async updatePassword(userID: string, password: string): Promise<void> {
    const { hash, salt } = hashPassword(password)
    try {
      await this.prisma.user.update({
        where: { id: userID },
        data: { password: hash, salt },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async setDeactivated(
    userID: string,
    at: Date | null,
  ): Promise<UserEntityRepo> {
    try {
      return await this.prisma.user.update({
        where: { id: userID },
        data: { deactivatedAt: at },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }
}

export { UserRepository }
