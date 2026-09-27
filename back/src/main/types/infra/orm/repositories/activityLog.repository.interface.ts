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

// Tâche 6, étape 4b : `GET /super-admin/access-log` (source=activite). Filtres libres — sous
// superadmin, `assertTenantReadScope` (tenant-guard.ts) ne s'applique qu'au contexte `tenant`,
// jamais à `superadmin` : rien n'exige donc un `where` particulier ici, contrairement au
// `findMany` ci-dessus (tenant ordinaire). Tous optionnels : sans aucun, la lecture rend TOUTE la
// table — y compris les lignes du script d'amorçage (`establishmentId: null`), qu'aucune autre
// route ne peut lire (voir le commentaire sur l'implémentation).
export type PlatformAccessLogFilters = {
  establishmentId?: string
  userID?: string
  action?: string
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
  findAllPlatformWide: (filters: PlatformAccessLogFilters) => Promise<ActivityLogEntityRepo[]>
  deleteOlderThan: (date: Date) => Promise<number>
}
