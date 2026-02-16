import type { IocContainer } from '../../../types/application/ioc'
import type {
  PathwayCreateEntityRepo,
  PathwayEntityRepo,
  PathwayRepositoryInterface,
  PathwayUpdateEntityRepo,
  PathwayWithSlotsRepo,
  PathwayWithTemplateAndSlotsRepo,
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

  findAll(): Promise<PathwayWithTemplateAndSlotsRepo[]> {
    return this.prisma.pathway.findMany({
      include: {
        template: true,
        slots: true,
      },
    })
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
      return await this.prisma.$transaction(async (tx) => {
        // Find the pathway with its slots to get slotTemplateIDs
        const pathway = await tx.pathway.findUniqueOrThrow({
          where: { id: pathwayID },
          include: {
            slots: {
              select: {
                id: true,
                slotTemplateID: true,
              },
            },
          },
        })

        const slotIDs = pathway.slots.map((slot) => slot.id)
        const slotTemplateIDs = pathway.slots.map((slot) => slot.slotTemplateID)

        // Delete all slots
        await tx.slot.deleteMany({
          where: { id: { in: slotIDs } },
        })

        // Delete all slotTemplates
        await tx.slotTemplate.deleteMany({
          where: { id: { in: slotTemplateIDs } },
        })

        // Delete the pathway
        return await tx.pathway.delete({
          where: { id: pathwayID },
        })
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
