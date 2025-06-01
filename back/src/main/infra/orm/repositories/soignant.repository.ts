import type { IocContainer } from '../../../types/application/ioc'
import type { SoignantRepositoryInterface } from '../../../types/infra/orm/repositories/soignant.repository.interface'
import type {
  SoignantCreateEntityRepo,
  SoignantEntityRepo,
  SoignantUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/soignant.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class SoignantRepository implements SoignantRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<SoignantEntityRepo[]> {
    return this.prisma.soignant.findMany()
  }

  async findByID(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.findUniqueOrThrow({
        where: { id: soignantID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async create(
    soignantCreateParams: SoignantCreateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.create({
        data: soignantCreateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async update(
    soignantID: string,
    soignantUpdateParams: SoignantUpdateEntityRepo,
  ): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.update({
        where: { id: soignantID },
        data: soignantUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }

  async delete(soignantID: string): Promise<SoignantEntityRepo> {
    try {
      return await this.prisma.soignant.delete({
        where: { id: soignantID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Soignant',
        error: err,
      })
    }
  }
}

export { SoignantRepository }
