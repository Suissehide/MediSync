import type { IocContainer } from '../../../types/application/ioc'
import type {
  ForbiddenWeekCreateEntityRepo,
  ForbiddenWeekEntityRepo,
  ForbiddenWeekRepositoryInterface,
} from '../../../types/infra/orm/repositories/forbiddenWeek.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class ForbiddenWeekRepository implements ForbiddenWeekRepositoryInterface {
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

  findAll(): Promise<ForbiddenWeekEntityRepo[]> {
    return this.prisma.forbiddenWeek.findMany({
      where: this.scope,
      orderBy: { startOfWeek: 'asc' },
    })
  }

  async create(
    params: ForbiddenWeekCreateEntityRepo,
  ): Promise<ForbiddenWeekEntityRepo> {
    try {
      return await this.prisma.forbiddenWeek.create({
        data: { ...params, ...this.scope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ForbiddenWeek',
        error: err,
      })
    }
  }

  async delete(id: string): Promise<ForbiddenWeekEntityRepo> {
    try {
      return await this.prisma.forbiddenWeek.delete({
        where: { id_serviceId: { id, serviceId: this.scope.serviceId } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'ForbiddenWeek',
        error: err,
      })
    }
  }
}

export { ForbiddenWeekRepository }
