import type { IocContainer } from '../types/application/ioc'
import type { ActivityReportDomainInterface } from '../types/domain/activityReport.domain.interface'
import type { ServiceDomainInterface } from '../types/domain/service.domain.interface'
import type { IndicatorCohortRepositoryInterface } from '../types/infra/orm/repositories/indicatorCohort.repository.interface'
import type { ServiceFieldRepositoryInterface } from '../types/infra/orm/repositories/serviceField.repository.interface'
import {
  type ActivityReport,
  type ActivitySettings,
  computeActivity,
  filterByPathwayTemplate,
} from '../utils/activity-indicators'
import type { DateRange } from '../utils/indicators/cohort'

// Même cohorte que les jeux d'indicateurs : les deux écrans partagent leurs définitions (MDS-40).
class ActivityReportDomain implements ActivityReportDomainInterface {
  private readonly indicatorCohortRepository: IndicatorCohortRepositoryInterface
  private readonly serviceDomain: ServiceDomainInterface
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface

  constructor({
    indicatorCohortRepository,
    serviceDomain,
    serviceFieldRepository,
  }: IocContainer) {
    this.indicatorCohortRepository = indicatorCohortRepository
    this.serviceDomain = serviceDomain
    this.serviceFieldRepository = serviceFieldRepository
  }

  async report(
    range: DateRange,
    pathwayTemplateId?: string,
  ): Promise<ActivityReport> {
    const [cohort, settings] = await Promise.all([
      this.indicatorCohortRepository.findCohort(range),
      this.activitySettings(),
    ])
    return computeActivity(
      pathwayTemplateId
        ? filterByPathwayTemplate(cohort, pathwayTemplateId)
        : cohort,
      settings,
    )
  }

  // Motifs d'arrêt : réglages du service (`Service.stopReasonFieldKey`/`completedChoiceKey`), pas
  // de champ ni de valeur codés en dur (décision 4, spec §2.4). Réglé seulement si les DEUX clés
  // sont posées : un champ choisi sans valeur de fin encore désignée (configuration à mi-chemin)
  // compterait sinon tout motif non vide comme un abandon.
  private async activitySettings(): Promise<ActivitySettings | null> {
    const service = await this.serviceDomain.findCurrent()
    if (
      service.stopReasonFieldKey === null ||
      service.completedChoiceKey === null
    ) {
      return null
    }
    const fields = await this.serviceFieldRepository.findAll()
    const field = fields.find((f) => f.key === service.stopReasonFieldKey)
    return {
      stopReasonField: service.stopReasonFieldKey,
      completedChoice: service.completedChoiceKey,
      labels: Object.fromEntries(
        (field?.choices ?? []).map((choice) => [choice.key, choice.label]),
      ),
    }
  }
}

export { ActivityReportDomain }
