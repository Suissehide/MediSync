import type { IocContainer } from '../types/application/ioc'
import type { ActivityLogDomainInterface } from '../types/domain/activityLog.domain.interface'
import type {
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogRepositoryInterface,
} from '../types/infra/orm/repositories/activityLog.repository.interface'

class ActivityLogDomain implements ActivityLogDomainInterface {
  private readonly activityLogRepository: ActivityLogRepositoryInterface

  constructor({ activityLogRepository }: IocContainer) {
    this.activityLogRepository = activityLogRepository
  }

  findMany(params: ActivityLogFindManyParams): Promise<ActivityLogFindManyResult> {
    return this.activityLogRepository.findMany(params)
  }

  async cleanup(): Promise<{ deleted: number }> {
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
    const deleted = await this.activityLogRepository.deleteOlderThan(twelveMonthsAgo)
    return { deleted }
  }
}

export { ActivityLogDomain }
