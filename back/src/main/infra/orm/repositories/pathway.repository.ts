import type { IocContainer } from '../../../types/application/ioc'
import type {
  PathwayCreateEntityRepo,
  PathwayEntityRepo,
  PathwayRepositoryInterface,
  PathwayUpdateEntityRepo,
  PathwayWithSlotsRepo,
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

  async findByTemplateIDAndDate(
    pathwayTemplateID: string,
    startDate: Date,
  ): Promise<PathwayWithSlotsRepo[]> {
    try {
      return await this.prisma.pathway.findMany({
        where: {
          startDate: { gte: startDate },
          template: {
            id: pathwayTemplateID,
          },
        },
        orderBy: {
          startDate: 'asc',
        },
        include: {
          slots: {
            include: {
              slotTemplate: {
                include: {
                  soignant: true,
                },
              },
              appointments: {
                include: {
                  appointmentPatients: {
                    include: {
                      patient: true,
                    },
                  },
                },
              },
            },
          },
        },
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
        data: {
          startDate: pathwayCreateParams.startDate,
          template: {
            connect: { id: pathwayCreateParams.templateID ?? undefined },
          },
          slots: {
            connect: pathwayCreateParams.slotIDs.map((id) => ({ id })),
          },
        },
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
