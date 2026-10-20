// Miroir de `back/src/main/utils/notification-prefs.ts` (forme de `User.notificationPrefs`).
export const NOTIFICATION_PREF_KEYS = [
  'reminder',
  'added',
  'moved',
  'absent',
  'diag',
  'end',
  'full',
  'mention',
  'due',
] as const
export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number]
export type NotificationLevel = 'all' | 'essential' | 'custom'
export type ReminderDelay = 'eve' | '2h' | '1h'

export type NotificationPrefs = {
  level: NotificationLevel
  services: string[] | null
  app: Record<NotificationPrefKey, boolean>
  reminderDelay: ReminderDelay
}
