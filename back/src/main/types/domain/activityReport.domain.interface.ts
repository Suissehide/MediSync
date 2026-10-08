import type { ActivityReport } from '../../utils/activity-indicators'
import type { ArsRange } from './arsIndicator.domain.interface'

export interface ActivityReportDomainInterface {
  report: (range: ArsRange) => Promise<ActivityReport>
}
