import { Prisma } from '../../../../generated/client'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  ServiceFieldCategoryCreateEntityRepo,
  ServiceFieldCategoryEntityRepo,
  ServiceFieldCategoryRepositoryInterface,
  ServiceFieldCategoryUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/serviceFieldCategory.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { DEFAULT_CATEGORIES } from '../../../utils/service-field-types'
import PrismaErrorCodes from '../error-codes-prisma'
import type { PostgresPrismaClient } from '../postgres-client'

class ServiceFieldCategoryRepository
  implements ServiceFieldCategoryRepositoryInterface
{
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

  findAll(): Promise<ServiceFieldCategoryEntityRepo[]> {
    return this.prisma.serviceFieldCategory.findMany({
      where: { ...this.scope },
      orderBy: { order: 'asc' },
    })
  }

  async findByID(categoryID: string): Promise<ServiceFieldCategoryEntityRepo> {
    try {
      return await this.prisma.serviceFieldCategory.findUniqueOrThrow({
        where: {
          id_serviceId: { id: categoryID, serviceId: this.scope.serviceId },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldCategory',
        error: err,
      })
    }
  }

  // Lit d'abord pour ne creer que les categories a date manquantes ; le P2002 ci-dessous reste la garde d'une course concurrente.
  async ensureDefaults(): Promise<void> {
    const existing = await this.prisma.serviceFieldCategory.findMany({
      where: { ...this.scope, dateField: { not: null } },
      select: { dateField: true },
    })
    const present = new Set(existing.map((c) => c.dateField))
    const missing = DEFAULT_CATEGORIES.filter(
      (category) => !present.has(category.dateField),
    )
    await Promise.all(
      missing.map((category) => this.createDefaultIfMissing(category)),
    )
  }

  private async createDefaultIfMissing(category: {
    label: string
    dateField: string
    order: number
  }): Promise<void> {
    try {
      await this.prisma.serviceFieldCategory.create({
        data: { ...category, ...this.scope },
      })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === PrismaErrorCodes.OPERATION_FAILED_ON_UNIQUE_CONSTRAINT
      ) {
        return
      }
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldCategory',
        error: err,
      })
    }
  }

  async create(
    params: ServiceFieldCategoryCreateEntityRepo,
  ): Promise<ServiceFieldCategoryEntityRepo> {
    try {
      return await this.prisma.serviceFieldCategory.create({
        data: {
          label: params.label,
          order: params.order,
          dateField: null,
          ...this.scope,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldCategory',
        error: err,
      })
    }
  }

  async update(
    categoryID: string,
    params: ServiceFieldCategoryUpdateEntityRepo,
  ): Promise<ServiceFieldCategoryEntityRepo> {
    try {
      return await this.prisma.serviceFieldCategory.update({
        where: {
          id_serviceId: { id: categoryID, serviceId: this.scope.serviceId },
        },
        data: { label: params.label, archivedAt: params.archivedAt },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ServiceFieldCategory',
        error: err,
      })
    }
  }

  async reorder(ids: string[]): Promise<void> {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.serviceFieldCategory.update({
          where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
          data: { order: index },
        }),
      ),
    )
  }
}

export { ServiceFieldCategoryRepository }
