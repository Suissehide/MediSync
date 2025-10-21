import type { PostgresPrismaClient } from '../postgres-client'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  SlotCreateEntityRepo,
  SlotDTORepo,
  SlotEntityRepo,
  SlotRepositoryInterface,
  SlotUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/slot.repository.interface'
import type { SlotTemplateRepositoryInterface } from '../../../types/infra/orm/repositories/slotTemplate.repository.interface'

class SlotRepository implements SlotRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface

  constructor({
    postgresOrm,
    errorHandler,
    slotTemplateRepository,
  }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.slotTemplateRepository = slotTemplateRepository
  }

  findAll(): Promise<SlotDTORepo[]> {
    return this.prisma.slot.findMany({
      include: {
        slotTemplate: {
          include: {
            soignant: true,
          },
        },
        pathway: true,
        appointments: {
          include: {
            patients: true,
          },
        },
      },
    })
  }

  async findByID(slotID: string): Promise<SlotDTORepo> {
    try {
      return await this.prisma.slot.findUniqueOrThrow({
        where: { id: slotID },
        include: {
          slotTemplate: {
            include: {
              soignant: true,
            },
          },
          pathway: true,
          appointments: {
            include: {
              patients: true,
            },
          },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        error: err,
      })
    }
  }

  async create(slotCreateParams: SlotCreateEntityRepo): Promise<SlotDTORepo> {
    try {
      return await this.prisma.slot.create({
        data: slotCreateParams,
        include: {
          slotTemplate: {
            include: {
              soignant: true,
            },
          },
          pathway: true,
          appointments: {
            include: {
              patients: true,
            },
          },
        },
      })
    } catch (err) {
      console.error('Prisma error:', err)
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        error: err,
      })
    }
  }

  async update(
    slotID: string,
    slotUpdateParams: SlotUpdateEntityRepo,
  ): Promise<SlotDTORepo> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const { slotTemplate: slotTemplateData, ...slotData } = slotUpdateParams

        if (slotTemplateData?.id) {
          await tx.slotTemplate.update({
            where: { id: slotTemplateData.id },
            data: slotTemplateData,
          })
        }

        return await tx.slot.update({
          where: { id: slotID },
          data: slotData,
          include: {
            slotTemplate: {
              include: {
                soignant: true,
              },
            },
            pathway: true,
            appointments: {
              include: {
                patients: true,
              },
            },
          },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        parentEntityName: 'SlotTemplate',
        error: err,
      })
    }
  }

  async delete(slotID: string): Promise<SlotEntityRepo> {
    try {
      return await this.prisma.slot.delete({
        where: { id: slotID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Slot',
        error: err,
      })
    }
  }
}

export { SlotRepository }
