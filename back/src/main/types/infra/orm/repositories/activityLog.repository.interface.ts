export type ActivityLogEntityRepo = {
  id: string
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityID: string
  createdAt: Date
}

export type ActivityLogCreateEntityRepo = Omit<ActivityLogEntityRepo, 'id' | 'createdAt'>

export type ActivityLogFindManyParams = {
  page: number
  action?: string
  userID?: string
  from?: Date
}

export type ActivityLogFindManyResult = {
  data: ActivityLogEntityRepo[]
  total: number
  page: number
}

export interface ActivityLogRepositoryInterface {
  create: (params: ActivityLogCreateEntityRepo) => Promise<void>
  findMany: (params: ActivityLogFindManyParams) => Promise<ActivityLogFindManyResult>
  deleteOlderThan: (date: Date) => Promise<number>
}
