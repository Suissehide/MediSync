export type ForbiddenWeekEntityRepo = {
  id: string
  startOfWeek: Date
  createdAt: Date
}

export type ForbiddenWeekCreateEntityRepo = {
  startOfWeek: Date
}

export interface ForbiddenWeekRepositoryInterface {
  findAll: () => Promise<ForbiddenWeekEntityRepo[]>
  create: (params: ForbiddenWeekCreateEntityRepo) => Promise<ForbiddenWeekEntityRepo>
  delete: (id: string) => Promise<ForbiddenWeekEntityRepo>
}
