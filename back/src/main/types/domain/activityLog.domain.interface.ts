import type {
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  PlatformAccessLogFilters,
} from '../infra/orm/repositories/activityLog.repository.interface'

export type ActivityLogEntity = ActivityLogEntityRepo

export interface ActivityLogDomainInterface {
  findMany: (params: ActivityLogFindManyParams) => Promise<ActivityLogFindManyResult>
  // Tâche 6, étape 4b : simple relais vers le dépôt, comme `PatientAccessLogDomain.
  // findByPatientInEstablishment` — le cloisonnement (ou son absence délibérée, à l'échelle
  // plateforme) se joue entièrement dans `ActivityLogRepository.findAllPlatformWide`.
  findAllPlatformWide: (filters: PlatformAccessLogFilters) => Promise<ActivityLogEntity[]>
  cleanup: () => Promise<{ deleted: number }>
}
