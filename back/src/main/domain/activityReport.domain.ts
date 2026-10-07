import type { IocContainer } from '../types/application/ioc'
import type { ActivityReportDomainInterface } from '../types/domain/activityReport.domain.interface'
import type { ArsRange } from '../types/domain/arsIndicator.domain.interface'
import type { ArsIndicatorRepositoryInterface } from '../types/infra/orm/repositories/arsIndicator.repository.interface'
import {
  type ActivityReport,
  computeActivity,
} from '../utils/activity-indicators'

// Même cohorte que l'ARS : les deux écrans partagent leurs définitions (MDS-40).
class ActivityReportDomain implements ActivityReportDomainInterface {
  private readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface

  constructor({ arsIndicatorRepository }: IocContainer) {
    this.arsIndicatorRepository = arsIndicatorRepository
  }

  async report({ from, to }: ArsRange): Promise<ActivityReport> {
    const { files, presences } = await this.arsIndicatorRepository.findCohort()
    return computeActivity({ from, to, files, presences })
  }
}

export { ActivityReportDomain }
