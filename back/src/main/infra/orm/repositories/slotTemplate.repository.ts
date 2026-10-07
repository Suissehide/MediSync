import type { IocContainer } from '../../../types/application/ioc'
import type {
  SlotTemplateCreateEntityRepo,
  SlotTemplateDTORepo,
  SlotTemplateRepositoryInterface,
  SlotTemplateUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/slotTemplate.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import {
  flattenSlotTemplate,
  slotTemplateInclude,
} from '../includes/slot-template.include'
import type { PostgresPrismaClient } from '../postgres-client'

class SlotTemplateRepository implements SlotTemplateRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  private links(soignantIDs: string[]) {
    return soignantIDs.map((soignantId) => ({
      soignantId,
      establishmentId: this.scope.establishmentId,
    }))
  }

  private createData(params: SlotTemplateCreateEntityRepo) {
    const { soignantIDs, ...rest } = params
    return {
      ...rest,
      ...this.scope,
      ...(soignantIDs !== undefined && {
        soignantLinks: { create: this.links(soignantIDs) },
      }),
    }
  }

  private updateData(params: SlotTemplateUpdateEntityRepo) {
    const { soignantIDs, ...rest } = params
    return {
      ...rest,
      ...(soignantIDs !== undefined && {
        soignantLinks: { deleteMany: {}, create: this.links(soignantIDs) },
      }),
    }
  }

  async findAll(): Promise<SlotTemplateDTORepo[]> {
    const rows = await this.prisma.slotTemplate.findMany({
      where: this.scope,
      include: slotTemplateInclude,
    })
    return rows.map(flattenSlotTemplate)
  }

  async findByID(slotTemplateID: string): Promise<SlotTemplateDTORepo> {
    try {
      const row = await this.prisma.slotTemplate.findUniqueOrThrow({
        where: {
          id_serviceId: { id: slotTemplateID, serviceId: this.scope.serviceId },
        },
        include: slotTemplateInclude,
      })
      return flattenSlotTemplate(row)
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
      const row = await this.prisma.slotTemplate.create({
        data: this.createData(slotTemplateCreateParams),
        include: slotTemplateInclude,
      })
      return flattenSlotTemplate(row)
    } catch (err) {
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
      const row = await this.prisma.slotTemplate.update({
        where: {
          id_serviceId: { id: slotTemplateID, serviceId: this.scope.serviceId },
        },
        data: this.updateData(slotTemplateUpdateParams),
        include: slotTemplateInclude,
      })
      return flattenSlotTemplate(row)
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
          serviceId: this.scope.serviceId,
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
      const row = await this.prisma.slotTemplate.delete({
        where: {
          id_serviceId: { id: slotTemplateID, serviceId: this.scope.serviceId },
        },
        include: slotTemplateInclude,
      })
      return flattenSlotTemplate(row)
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'SlotTemplate',
        error: err,
      })
    }
  }
}

export { SlotTemplateRepository }
