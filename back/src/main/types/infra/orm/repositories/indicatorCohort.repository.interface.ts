import type {
  DateRange,
  IndicatorCohort,
} from '../../../../utils/indicators/cohort'

export interface IndicatorCohortRepositoryInterface {
  findCohort: (range: DateRange) => Promise<IndicatorCohort>
}
