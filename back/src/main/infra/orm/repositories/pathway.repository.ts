import type { IocContainer } from '../../../types/application/ioc'
import type { PathwayRepositoryInterface } from '../../../types/infra/orm/repositories/pathway.repository.interface'
import type {
  PathwayCreateEntityRepo,
  PathwayEntityRepo,
  PathwayUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/pathway.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class PathwayRepository implements PathwayRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<PathwayEntityRepo[]> {
    return this.prisma.pathway.findMany()
  }

  async findByID(pathwayID: string): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.findUniqueOrThrow({
        where: { id: pathwayID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async create(
    pathwayCreateParams: PathwayCreateEntityRepo,
  ): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.create({
        data: pathwayCreateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async update(
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityRepo,
  ): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.update({
        where: { id: pathwayID },
        data: pathwayUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async delete(pathwayID: string): Promise<PathwayEntityRepo> {
    try {
      return await this.prisma.pathway.delete({
        where: { id: pathwayID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }
}

export { PathwayRepository }
