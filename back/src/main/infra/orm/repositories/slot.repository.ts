import type { IocContainer } from '../../../types/application/ioc'
import type {
  SlotCreateEntityRepo,
  SlotDateRangeRepo,
  SlotDTORepo,
  SlotEntityRepo,
  SlotRepositoryInterface,
  SlotUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/slot.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class SlotRepository implements SlotRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(dateRange?: SlotDateRangeRepo): Promise<SlotDTORepo[]> {
    return this.prisma.slot.findMany({
      // Un créneau est retenu dès qu'il chevauche la fenêtre : il doit finir
      // après le début demandé et commencer avant la fin demandée.
      where: {
        ...(dateRange?.from ? { endDate: { gt: dateRange.from } } : {}),
        ...(dateRange?.to ? { startDate: { lt: dateRange.to } } : {}),
      },
      include: {
        slotTemplate: {
          include: {
            soignants: true,
            thematic: true,
            location: true,
          },
        },
        pathway: {
          include: {
            template: true,
          },
        },
        appointments: {
          include: {
            thematic: true,
            appointmentPatients: {
              include: {
                patient: true,
              },
            },
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
              soignants: true,
              thematic: true,
              location: true,
            },
          },
          pathway: {
            include: {
              template: true,
            },
          },
          appointments: {
            include: {
              thematic: true,
              appointmentPatients: {
                include: {
                  patient: true,
                },
              },
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
              soignants: true,
              thematic: true,
              location: true,
            },
          },
          pathway: {
            include: {
              template: true,
            },
          },
          appointments: {
            include: {
              thematic: true,
              appointmentPatients: {
                include: {
                  patient: true,
                },
              },
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
          const { soignantIDs, id: _id, ...templateRest } = slotTemplateData
          const data =
            soignantIDs === undefined
              ? templateRest
              : {
                  ...templateRest,
                  soignants: { set: soignantIDs.map((id) => ({ id })) },
                }
          await tx.slotTemplate.update({
            where: { id: slotTemplateData.id },
            data,
          })
        }

        return await tx.slot.update({
          where: { id: slotID },
          data: slotData,
          include: {
            slotTemplate: {
              include: {
                soignants: true,
                thematic: true,
                location: true,
              },
            },
            pathway: {
            include: {
              template: true,
            },
          },
            appointments: {
              include: {
                thematic: true,
                appointmentPatients: {
                  include: {
                    patient: true,
                  },
                },
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
