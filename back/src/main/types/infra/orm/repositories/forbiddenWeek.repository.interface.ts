import type { ForbiddenWeek, Prisma } from '../../../../../generated/client'

export type ForbiddenWeekEntityRepo = ForbiddenWeek

// Le repository pose serviceId/establishmentId lui-même : l'appelant ne les fournit pas.
export type ForbiddenWeekCreateEntityRepo = Omit<
  Prisma.ForbiddenWeekUncheckedCreateInput,
  'serviceId' | 'establishmentId'
>

export interface ForbiddenWeekRepositoryInterface {
  findAll: () => Promise<ForbiddenWeekEntityRepo[]>
  create: (
    params: ForbiddenWeekCreateEntityRepo,
  ) => Promise<ForbiddenWeekEntityRepo>
  delete: (id: string) => Promise<ForbiddenWeekEntityRepo>
}
