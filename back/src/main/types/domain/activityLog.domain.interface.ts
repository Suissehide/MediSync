import type {
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
  ActivityLogScopeFilters,
  PlatformAccessLogFilters,
  PlatformAccessLogPage,
} from '../infra/orm/repositories/activityLog.repository.interface'

export type ActivityLogEntity = ActivityLogEntityRepo

export interface ActivityLogDomainInterface {
  findMany: (
    params: ActivityLogFindManyParams,
  ) => Promise<ActivityLogFindManyResult>
  // Simple relais vers le dépôt, comme `PatientAccessLogDomain.
  // findByPatientInEstablishment` — le cloisonnement (ou son absence délibérée, à l'échelle
  // plateforme) se joue entièrement dans `ActivityLogRepository.findAllPlatformWide`.
  findAllPlatformWide: (
    filters: PlatformAccessLogFilters,
  ) => Promise<PlatformAccessLogPage>
  cleanup: (filters?: ActivityLogScopeFilters) => Promise<{ deleted: number }>
}
