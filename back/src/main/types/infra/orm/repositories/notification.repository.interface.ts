import type { Notification } from '../../../../../generated/client'

export type NotificationEntityRepo = Notification

export interface NotificationRepositoryInterface {
  findMine: (userId: string, since: Date) => Promise<NotificationEntityRepo[]>
  markRead: (userId: string, notificationId: string) => Promise<number>
  markAllRead: (userId: string) => Promise<void>
}
