import type { Notification } from '../../../../../generated/client'
import type { NotificationType } from '../../../../../generated/enums'

export type NotificationEntityRepo = Notification

// Pas de serviceId/establishmentId ici : le depot les pose lui-meme (meme
// convention que les autres entrees de creation du repertoire).
export type NotificationCreateEntityRepo = {
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  dedupeKey?: string
}

export interface NotificationRepositoryInterface {
  findMine: (userId: string, since: Date) => Promise<NotificationEntityRepo[]>
  markRead: (userId: string, notificationId: string) => Promise<number>
  markAllRead: (userId: string) => Promise<void>
  // `skipDuplicates` : une ligne dont (userId, dedupeKey) existe deja est silencieusement
  // ignoree (clef d'unicite `@@unique([userId, dedupeKey])`) ; sans dedupeKey (undefined),
  // jamais de collision (NULL != NULL dans une contrainte d'unicite Postgres).
  createMany: (rows: NotificationCreateEntityRepo[]) => Promise<void>
}
