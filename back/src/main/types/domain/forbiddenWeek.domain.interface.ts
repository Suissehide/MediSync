import type { ForbiddenWeekEntityRepo } from '../infra/orm/repositories/forbiddenWeek.repository.interface'

export type ForbiddenWeekEntityDomain = ForbiddenWeekEntityRepo

export interface ForbiddenWeekDomainInterface {
  findAll: () => Promise<ForbiddenWeekEntityDomain[]>
  create: (date: Date) => Promise<ForbiddenWeekEntityDomain>
  delete: (id: string) => Promise<ForbiddenWeekEntityDomain>
}
