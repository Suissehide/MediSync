import type {
  ActivityLogEntityRepo,
  ActivityLogFindManyParams,
  ActivityLogFindManyResult,
} from '../infra/orm/repositories/activityLog.repository.interface'

export type ActivityLogEntity = ActivityLogEntityRepo

export interface ActivityLogDomainInterface {
  findMany: (params: ActivityLogFindManyParams) => Promise<ActivityLogFindManyResult>
  cleanup: () => Promise<{ deleted: number }>
}
