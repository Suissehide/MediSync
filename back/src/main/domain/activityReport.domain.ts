import type { IocContainer } from '../types/application/ioc'
import type { ActivityReportDomainInterface } from '../types/domain/activityReport.domain.interface'
import type { IndicatorCohortRepositoryInterface } from '../types/infra/orm/repositories/indicatorCohort.repository.interface'
import {
  type ActivityReport,
  computeActivity,
  filterByPathwayTemplate,
} from '../utils/activity-indicators'
import type { DateRange } from '../utils/indicators/cohort'

// Même cohorte que les jeux d'indicateurs : les deux écrans partagent leurs définitions (MDS-40).
class ActivityReportDomain implements ActivityReportDomainInterface {
  private readonly indicatorCohortRepository: IndicatorCohortRepositoryInterface

  constructor({ indicatorCohortRepository }: IocContainer) {
    this.indicatorCohortRepository = indicatorCohortRepository
  }

  async report(
    range: DateRange,
    pathwayTemplateId?: string,
  ): Promise<ActivityReport> {
    const cohort = await this.indicatorCohortRepository.findCohort(range)
    return computeActivity(
      pathwayTemplateId
        ? filterByPathwayTemplate(cohort, pathwayTemplateId)
        : cohort,
    )
  }
}

export { ActivityReportDomain }
