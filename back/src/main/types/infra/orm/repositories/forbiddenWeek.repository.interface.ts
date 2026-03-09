import type { ForbiddenWeek, Prisma } from '../../../../../generated/client'

export type ForbiddenWeekEntityRepo = ForbiddenWeek

export type ForbiddenWeekCreateEntityRepo = Prisma.ForbiddenWeekUncheckedCreateInput

export interface ForbiddenWeekRepositoryInterface {
  findAll: () => Promise<ForbiddenWeekEntityRepo[]>
  create: (params: ForbiddenWeekCreateEntityRepo) => Promise<ForbiddenWeekEntityRepo>
  delete: (id: string) => Promise<ForbiddenWeekEntityRepo>
}
