import type { PlanningCycle } from '../../../../../generated/client'

export type PlanningCycleEntityRepo = PlanningCycle

export type PlanningCycleUpsertEntityRepo = {
  startOfWeek: Date
  weekCount: number
}

export interface PlanningCycleRepositoryInterface {
  find: () => Promise<PlanningCycleEntityRepo | null>
  upsert: (
    params: PlanningCycleUpsertEntityRepo,
  ) => Promise<PlanningCycleEntityRepo>
  delete: () => Promise<void>
}
