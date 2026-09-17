import type { PlanningCycle } from '../../../generated/client'

export type PlanningCycleEntityDomain = PlanningCycle

export type SavePlanningCycleParams = {
  startOfWeek: Date
  weekCount: number
}

export interface PlanningCycleDomainInterface {
  find: () => Promise<PlanningCycleEntityDomain | null>
  save: (params: SavePlanningCycleParams) => Promise<PlanningCycleEntityDomain>
  delete: () => Promise<void>
}
