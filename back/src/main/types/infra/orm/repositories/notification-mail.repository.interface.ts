import type {
  NotificationMailState,
  NotificationType,
} from '../../../../../generated/enums'
import type { NotificationPrefs } from '../../../../utils/notification-prefs'

// Lectures hors tenant : chaque methode porte ses bornes, tenantContext.scope() leverait sous runAsSystem.

export type PendingNotificationRow = {
  id: string
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  serviceId: string
  readAt: Date | null
  createdAt: Date
}

export type RecipientRow = {
  email: string
  firstName: string | null
  lastName: string | null
  deactivatedAt: Date | null
  prefs: NotificationPrefs
}

export interface NotificationMailRepositoryInterface {
  pending: (since: Date) => Promise<PendingNotificationRow[]>
  // Notifications PENDING plus vieilles que `date` : basculees SKIPPED, jamais envoyees.
  expireOlderThan: (date: Date) => Promise<number>
  // Preferences normalisees + services reels (meme lecture que UserRepository.findNotificationPrefsMany).
  recipients: (userIds: string[]) => Promise<Map<string, RecipientRow>>
  // Prenom nom des auteurs de mention.
  names: (userIds: string[]) => Promise<Map<string, string>>
  mark: (ids: string[], state: NotificationMailState) => Promise<void>
}
