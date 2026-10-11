import type { ActivityReport } from '../../utils/activity-indicators'
import type { DateRange } from '../../utils/indicators/cohort'

export interface ActivityReportDomainInterface {
  report: (
    range: DateRange,
    pathwayTemplateId?: string,
  ) => Promise<ActivityReport>
}
