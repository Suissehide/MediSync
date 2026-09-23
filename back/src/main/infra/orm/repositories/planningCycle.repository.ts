import type { IocContainer } from '../../../types/application/ioc'
import type {
  PlanningCycleEntityRepo,
  PlanningCycleRepositoryInterface,
  PlanningCycleUpsertEntityRepo,
} from '../../../types/infra/orm/repositories/planningCycle.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

class PlanningCycleRepository implements PlanningCycleRepositoryInterface {
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

  find(): Promise<PlanningCycleEntityRepo | null> {
    return this.prisma.planningCycle.findUnique({
      where: { serviceId: this.scope.serviceId },
    })
  }

  async upsert(
    params: PlanningCycleUpsertEntityRepo,
  ): Promise<PlanningCycleEntityRepo> {
    try {
      return await this.prisma.planningCycle.upsert({
        where: { serviceId: this.scope.serviceId },
        create: { ...this.scope, ...params },
        update: params,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PlanningCycle',
        error: err,
      })
    }
  }

  // Supprimer un cycle inexistant n'est pas une erreur : le résultat visé
  // (aucun cycle configuré) est déjà atteint, d'où `deleteMany`.
  async delete(): Promise<void> {
    try {
      await this.prisma.planningCycle.deleteMany({
        where: { serviceId: this.scope.serviceId },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PlanningCycle',
        error: err,
      })
    }
  }
}

export { PlanningCycleRepository }
