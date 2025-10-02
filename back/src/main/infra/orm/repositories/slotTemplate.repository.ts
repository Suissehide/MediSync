import type { PostgresPrismaClient } from '../postgres-client'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  SlotTemplateDTORepo,
  SlotTemplateRepositoryInterface,
} from '../../../types/infra/orm/repositories/slotTemplate.repository.interface'
import type {
  SlotTemplateCreateEntityRepo,
  SlotTemplateUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/slotTemplate.repository.interface'

class SlotTemplateRepository implements SlotTemplateRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<SlotTemplateDTORepo[]> {
    return this.prisma.slotTemplate.findMany({
      include: {
        soignant: true,
        template: true,
      },
    })
  }

  async findByID(slotTemplateID: string): Promise<SlotTemplateDTORepo> {
    try {
      return await this.prisma.slotTemplate.findUniqueOrThrow({
        where: { id: slotTemplateID },
        include: {
          soignant: true,
          template: true,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'SlotTemplate',
        error: err,
      })
    }
  }

  async create(
    slotTemplateCreateParams: SlotTemplateCreateEntityRepo,
  ): Promise<SlotTemplateDTORepo> {
    try {
      return await this.prisma.slotTemplate.create({
        data: slotTemplateCreateParams,
        include: {
          soignant: true,
          template: true,
        },
      })
    } catch (err) {
      console.error('Prisma error:', err)
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'SlotTemplate',
        parentEntityName: 'Soignant',
        error: err,
      })
    }
  }

  async update(
    slotTemplateID: string,
    slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
  ): Promise<SlotTemplateDTORepo> {
    try {
      return await this.prisma.slotTemplate.update({
        where: { id: slotTemplateID },
        data: slotTemplateUpdateParams,
        include: {
          soignant: true,
          template: true,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'SlotTemplate',
        error: err,
      })
    }
  }

  async delete(slotTemplateID: string): Promise<SlotTemplateDTORepo> {
    try {
      return await this.prisma.slotTemplate.delete({
        where: { id: slotTemplateID },
        include: {
          soignant: true,
          template: true,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'SlotTemplate',
        error: err,
      })
    }
  }
}

export { SlotTemplateRepository }
