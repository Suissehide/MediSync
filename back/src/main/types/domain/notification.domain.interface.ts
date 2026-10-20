import type { NotificationEntityRepo } from '../infra/orm/repositories/notification.repository.interface'

export type NotificationDomainInterface = {
  findMine: () => Promise<NotificationEntityRepo[]>
  markRead: (notificationId: string) => Promise<void>
  markAllRead: () => Promise<void>
}
