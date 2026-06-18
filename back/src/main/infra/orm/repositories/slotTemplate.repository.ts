import type { IocContainer } from '../../../types/application/ioc'
import type {
  SlotTemplateCreateEntityRepo,
  SlotTemplateDTORepo,
  SlotTemplateRepositoryInterface,
  SlotTemplateUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/slotTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

function applyConnect(params: SlotTemplateCreateEntityRepo) {
  const { soignantIDs, ...rest } = params
  if (soignantIDs === undefined) return rest
  return {
    ...rest,
    soignants: { connect: soignantIDs.map((id) => ({ id })) },
  }
}

function applySet(params: SlotTemplateUpdateEntityRepo) {
  const { soignantIDs, ...rest } = params
  if (soignantIDs === undefined) return rest
  return {
    ...rest,
    soignants: { set: soignantIDs.map((id) => ({ id })) },
  }
}

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
        soignants: true,
        template: true,
        location: true,
      },
    })
  }

  async findByID(slotTemplateID: string): Promise<SlotTemplateDTORepo> {
    try {
      return await this.prisma.slotTemplate.findUniqueOrThrow({
        where: { id: slotTemplateID },
        include: {
          soignants: true,
          template: true,
          location: true,
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
        data: applyConnect(slotTemplateCreateParams),
        include: {
          soignants: true,
          template: true,
          location: true,
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
        data: applySet(slotTemplateUpdateParams),
        include: {
          soignants: true,
          template: true,
          location: true,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'SlotTemplate',
        error: err,
      })
    }
  }

  async updateMany(
    slotTemplateIDs: string[],
    slotTemplateUpdateParams: SlotTemplateUpdateEntityRepo,
  ): Promise<void> {
    if (slotTemplateUpdateParams.soignantIDs !== undefined) {
      throw new Error(
        'updateMany cannot set soignantIDs — use update() per record',
      )
    }
    try {
      await this.prisma.slotTemplate.updateMany({
        where: {
          id: { in: slotTemplateIDs },
        },
        data: slotTemplateUpdateParams,
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
          soignants: true,
          template: true,
          location: true,
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
