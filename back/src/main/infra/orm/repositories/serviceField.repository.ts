import Boom from '@hapi/boom'

import type { IocContainer } from '../../../types/application/ioc'
import type {
  ServiceFieldChoiceCreateEntityRepo,
  ServiceFieldChoiceUpdateEntityRepo,
  ServiceFieldCreateEntityRepo,
  ServiceFieldEntityRepo,
  ServiceFieldRepositoryInterface,
  ServiceFieldUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/serviceField.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class ServiceFieldRepository implements ServiceFieldRepositoryInterface {
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

  findAll(): Promise<ServiceFieldEntityRepo[]> {
    return this.prisma.serviceFieldDefinition.findMany({
      where: { ...this.scope },
      orderBy: [{ category: { order: 'asc' } }, { order: 'asc' }],
      include: { choices: { orderBy: { order: 'asc' } } },
    })
  }

  async findByID(fieldID: string): Promise<ServiceFieldEntityRepo> {
    try {
      return await this.prisma.serviceFieldDefinition.findUniqueOrThrow({
        where: {
          id_serviceId: { id: fieldID, serviceId: this.scope.serviceId },
        },
        include: { choices: { orderBy: { order: 'asc' } } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldDefinition',
        error: err,
      })
    }
  }

  async create(
    params: ServiceFieldCreateEntityRepo,
  ): Promise<ServiceFieldEntityRepo> {
    try {
      return await this.prisma.serviceFieldDefinition.create({
        data: {
          key: params.key,
          label: params.label,
          type: params.type,
          categoryId: params.categoryId,
          order: params.order,
          clinical: params.clinical,
          unit: params.unit,
          ...this.scope,
          // La ligne nestée refuse `serviceId` à l'exécution même si tsc l'accepte : seul `establishmentId` passe (tâche 3).
          choices: {
            create: params.choices.map((choice) => ({
              key: choice.key,
              label: choice.label,
              order: choice.order,
              establishmentId: this.scope.establishmentId,
            })),
          },
        },
        include: { choices: { orderBy: { order: 'asc' } } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldDefinition',
        error: err,
      })
    }
  }

  async update(
    fieldID: string,
    params: ServiceFieldUpdateEntityRepo,
  ): Promise<ServiceFieldEntityRepo> {
    try {
      return await this.prisma.serviceFieldDefinition.update({
        where: {
          id_serviceId: { id: fieldID, serviceId: this.scope.serviceId },
        },
        data: {
          label: params.label,
          unit: params.unit,
          archivedAt: params.archivedAt,
          categoryId: params.categoryId,
          order: params.order,
        },
        include: { choices: { orderBy: { order: 'asc' } } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldDefinition',
        error: err,
      })
    }
  }

  async createChoice(
    fieldID: string,
    params: ServiceFieldChoiceCreateEntityRepo,
  ): Promise<ServiceFieldEntityRepo> {
    try {
      // Création directe (non nestée) : contrairement à `choices.create` sous une définition, `serviceId` est bien exigé ici (tâche 3).
      await this.prisma.serviceFieldChoice.create({
        data: {
          key: params.key,
          label: params.label,
          order: params.order,
          fieldId: fieldID,
          ...this.scope,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldChoice',
        error: err,
      })
    }
    return this.findByID(fieldID)
  }

  async updateChoice(
    fieldID: string,
    choiceID: string,
    params: ServiceFieldChoiceUpdateEntityRepo,
  ): Promise<ServiceFieldEntityRepo> {
    let result: { count: number }
    try {
      result = await this.prisma.serviceFieldChoice.updateMany({
        where: { id: choiceID, fieldId: fieldID, ...this.scope },
        data: { label: params.label, archivedAt: params.archivedAt },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldChoice',
        error: err,
      })
    }
    if (result.count === 0) {
      throw Boom.notFound('ServiceFieldChoice introuvable')
    }
    return this.findByID(fieldID)
  }

  async reorderFields(ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.serviceFieldDefinition.update({
          where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
          data: { order: index },
        }),
      ),
    )
  }

  async reorderChoices(fieldID: string, ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.serviceFieldChoice.updateMany({
          where: { id, fieldId: fieldID, ...this.scope },
          data: { order: index },
        }),
      ),
    )
  }
}

export { ServiceFieldRepository }
