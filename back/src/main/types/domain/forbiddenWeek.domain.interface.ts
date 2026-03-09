import type { ForbiddenWeek } from '../../../generated/client'

export type ForbiddenWeekEntityDomain = ForbiddenWeek

export interface ForbiddenWeekDomainInterface {
  findAll: () => Promise<ForbiddenWeekEntityDomain[]>
  create: (date: Date) => Promise<ForbiddenWeekEntityDomain>
  delete: (id: string) => Promise<ForbiddenWeekEntityDomain>
}
