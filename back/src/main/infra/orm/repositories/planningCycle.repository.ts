import type { IocContainer } from '../../../types/application/ioc'
import type {
  PlanningCycleEntityRepo,
  PlanningCycleRepositoryInterface,
  PlanningCycleUpsertEntityRepo,
} from '../../../types/infra/orm/repositories/planningCycle.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

/** Identifiant de la ligne unique : la configuration est globale au service. */
const PLANNING_CYCLE_ID = 'default'

class PlanningCycleRepository implements PlanningCycleRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  find(): Promise<PlanningCycleEntityRepo | null> {
    return this.prisma.planningCycle.findUnique({
      where: { id: PLANNING_CYCLE_ID },
    })
  }

  async upsert(
    params: PlanningCycleUpsertEntityRepo,
  ): Promise<PlanningCycleEntityRepo> {
    try {
      return await this.prisma.planningCycle.upsert({
        where: { id: PLANNING_CYCLE_ID },
        create: { id: PLANNING_CYCLE_ID, ...params },
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
        where: { id: PLANNING_CYCLE_ID },
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
