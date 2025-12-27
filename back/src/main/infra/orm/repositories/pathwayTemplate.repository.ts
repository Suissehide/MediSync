import type { IocContainer } from '../../../types/application/ioc'
import type {
  PathwayTemplateCreateEntityRepo,
  PathwayTemplateEntityRepo,
  PathwayTemplateRepositoryInterface,
  PathwayTemplateUpdateEntityRepo,
  PathwayTemplateWithSlotTemplatesRepo,
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
    return this.prisma.pathwayTemplate.findMany({
      include: {
        slotTemplates: {
          include: {
            soignant: true,
          },
        },
      },
    })
  }

  async findByID(
    pathwayTemplateID: string,
  ): Promise<PathwayTemplateWithSlotTemplatesRepo> {
    try {
      return await this.prisma.pathwayTemplate.findUniqueOrThrow({
        where: { id: pathwayTemplateID },
        include: {
          slotTemplates: {
            include: {
              soignant: true,
            },
          },
        },
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
    const { slotTemplateIDs, ...pathwayTemplateData } =
      pathwayTemplateCreateParams

    try {
      return await this.prisma.pathwayTemplate.create({
        data: {
          ...pathwayTemplateData,
          slotTemplates: {
            connect: slotTemplateIDs?.map((id) => ({ id })),
          },
        },
        include: {
          slotTemplates: {
            include: {
              soignant: true,
            },
          },
        },
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
      const { slotTemplateIDs, ...data } = pathwayTemplateUpdateParams

      return await this.prisma.pathwayTemplate.update({
        where: { id: pathwayTemplateID },
        data: {
          ...data,
          ...(slotTemplateIDs && {
            slotTemplates: {
              connect: slotTemplateIDs.map((id) => ({ id })),
            },
          }),
        },
        include: {
          slotTemplates: {
            include: {
              soignant: true,
            },
          },
        },
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
        include: {
          slotTemplates: {
            include: {
              soignant: true,
            },
          },
        },
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
