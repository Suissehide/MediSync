import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  PlanningCycleDomainInterface,
  PlanningCycleEntityDomain,
  SavePlanningCycleParams,
} from '../types/domain/planningCycle.domain.interface'
import type { PlanningCycleRepositoryInterface } from '../types/infra/orm/repositories/planningCycle.repository.interface'
import { toStartOfWeek } from '../utils/date'

const MIN_WEEK_COUNT = 1
const MAX_WEEK_COUNT = 52

class PlanningCycleDomain implements PlanningCycleDomainInterface {
  private readonly planningCycleRepository: PlanningCycleRepositoryInterface

  constructor({ planningCycleRepository }: IocContainer) {
    this.planningCycleRepository = planningCycleRepository
  }

  find(): Promise<PlanningCycleEntityDomain | null> {
    return this.planningCycleRepository.find()
  }

  // `async` est volontaire : le garde-fou doit produire une promesse rejetee,
  // pas une exception synchrone, sinon les appelants (et les tests, qui
  // utilisent `rejects.toThrow`) ne la voient pas passer par le chemin
  // asynchrone. Le `return await` satisfait aussi la regle Biome `useAwait`.
  async save({
    startOfWeek,
    weekCount,
  }: SavePlanningCycleParams): Promise<PlanningCycleEntityDomain> {
    if (
      !Number.isInteger(weekCount) ||
      weekCount < MIN_WEEK_COUNT ||
      weekCount > MAX_WEEK_COUNT
    ) {
      throw Boom.badRequest(
        `weekCount must be an integer between ${MIN_WEEK_COUNT} and ${MAX_WEEK_COUNT}`,
      )
    }

    // La semaine de depart est toujours stockee sur son lundi : le front
    // n'a alors aucune normalisation a refaire avant de calculer le modulo.
    return await this.planningCycleRepository.upsert({
      startOfWeek: toStartOfWeek(startOfWeek),
      weekCount,
    })
  }

  delete(): Promise<void> {
    return this.planningCycleRepository.delete()
  }
}

export { PlanningCycleDomain }
