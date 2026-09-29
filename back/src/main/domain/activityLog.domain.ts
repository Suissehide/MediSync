import type { Config } from '../types/application/config'
import type { IocContainer } from '../types/application/ioc'
import type { ActivityLogDomainInterface } from '../types/domain/activityLog.domain.interface'
import type {
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
  ActivityLogScopeFilters,
  PlatformAccessLogFilters,
} from '../types/infra/orm/repositories/activityLog.repository.interface'

class ActivityLogDomain implements ActivityLogDomainInterface {
  private readonly activityLogRepository: ActivityLogRepositoryInterface
  private readonly config: Config

  constructor({ activityLogRepository, config }: IocContainer) {
    this.activityLogRepository = activityLogRepository
    this.config = config
  }

  findMany(
    params: ActivityLogFindManyParams,
  ): Promise<ActivityLogFindManyResult> {
    return this.activityLogRepository.findMany(params)
  }

  findAllPlatformWide(
    filters: PlatformAccessLogFilters,
  ): Promise<ActivityLogEntityRepo[]> {
    return this.activityLogRepository.findAllPlatformWide(filters)
  }

  // Retention parametrable (tache 8, etape 4b) : `config.logRetentionMonths`, jamais douze en
  // dur. Calcul duplique a l'identique dans `PatientAccessLogDomain.cleanup` plutot que
  // factorise -- un sabotage qui remet douze en dur dans UN SEUL des deux domaines doit faire
  // rougir le test de CE domaine seul, jamais les deux ensemble.
  async cleanup(
    filters: ActivityLogScopeFilters = {},
  ): Promise<{ deleted: number }> {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - this.config.logRetentionMonths)
    const deleted = await this.activityLogRepository.deleteOlderThan(
      cutoff,
      filters,
    )
    return { deleted }
  }
}

export { ActivityLogDomain }
