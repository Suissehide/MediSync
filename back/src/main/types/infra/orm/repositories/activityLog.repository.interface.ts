import type { PrimaTransactionClient } from '../client'

export type ActivityLogEntityRepo = {
  id: string
  establishmentId: string | null
  serviceId: string | null
  userID: string
  userFirstName: string | null
  userLastName: string | null
  action: string
  entityType: string
  entityID: string
  createdAt: Date
}

export type ActivityLogCreateEntityRepo = Omit<
  ActivityLogEntityRepo,
  'id' | 'createdAt' | 'establishmentId' | 'serviceId'
>

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
  // `client` optionnel (tâche 11, étape 4a, tour de correction 1) : voir le commentaire sur
  // l'implémentation.
  create: (
    params: ActivityLogCreateEntityRepo,
    client?: PrimaTransactionClient,
  ) => Promise<void>
  findMany: (
    params: ActivityLogFindManyParams,
  ) => Promise<ActivityLogFindManyResult>
  deleteOlderThan: (date: Date) => Promise<number>
}
