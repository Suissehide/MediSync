import type { IocContainer } from '../../../types/application/ioc'
import type { PathwayTemplateRepositoryInterface } from '../../../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type {
  PathwayTemplateCreateEntityRepo,
  PathwayTemplateEntityRepo,
  PathwayTemplateUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class PathwayTemplateRepository implements PathwayTemplateRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<PathwayTemplateEntityRepo[]> {
    return this.prisma.pathwayTemplate.findMany()
  }

  async findByID(
    pathwayTemplateID: string,
  ): Promise<PathwayTemplateEntityRepo> {
    try {
      return await this.prisma.pathwayTemplate.findUniqueOrThrow({
        where: { id: pathwayTemplateID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }

  async create(
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityRepo,
  ): Promise<PathwayTemplateEntityRepo> {
    try {
      return await this.prisma.pathwayTemplate.create({
        data: pathwayTemplateCreateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }

  async update(
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityRepo,
  ): Promise<PathwayTemplateEntityRepo> {
    try {
      return await this.prisma.pathwayTemplate.update({
        where: { id: pathwayTemplateID },
        data: pathwayTemplateUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }

  async delete(pathwayTemplateID: string): Promise<PathwayTemplateEntityRepo> {
    try {
      return await this.prisma.pathwayTemplate.delete({
        where: { id: pathwayTemplateID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PathwayTemplate',
        error: err,
      })
    }
  }
}

export { PathwayTemplateRepository }
