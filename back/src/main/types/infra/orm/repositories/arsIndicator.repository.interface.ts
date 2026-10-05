import type { ArsFile } from '../../../../utils/ars-indicators'

export interface ArsIndicatorRepositoryInterface {
  findCohort: () => Promise<ArsFile[]>
  findServiceName: () => Promise<string>
}
