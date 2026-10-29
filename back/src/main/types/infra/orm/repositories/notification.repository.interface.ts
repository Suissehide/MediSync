import type { Notification } from '../../../../../generated/client'
import type { NotificationType } from '../../../../../generated/enums'

export type NotificationEntityRepo = Notification

// Pas de serviceId/establishmentId ici : le depot les pose lui-meme (convention du repertoire).
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
  // `skipDuplicates` ignore un (userId, dedupeKey) deja pris ; sans dedupeKey, jamais de collision.
  createMany: (rows: NotificationCreateEntityRepo[]) => Promise<void>
}
