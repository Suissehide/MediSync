import type { NotificationType } from '../../generated/enums'

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
export type ReminderDelay = 'eve' | '2h' | '1h'
export type NotificationLevel = 'all' | 'essential' | 'custom'
export type NotificationPrefs = {
  level: NotificationLevel
  services: string[] | null
  app: Record<NotificationPrefKey, boolean>
  reminderDelay: ReminderDelay
}

const LEVELS: readonly NotificationLevel[] = ['all', 'essential', 'custom']
const DELAYS: readonly ReminderDelay[] = ['eve', '2h', '1h']
const allOn = () =>
  Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, true])) as Record<
    NotificationPrefKey,
    boolean
  >

export const DEFAULT_PREFS: NotificationPrefs = {
  level: 'essential',
  services: null,
  app: allOn(),
  reminderDelay: 'eve',
}

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

export const normalizePrefs = (raw: unknown): NotificationPrefs => {
  const r =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawApp =
    r.app && typeof r.app === 'object' ? (r.app as Record<string, unknown>) : {}
  const app = allOn()
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof rawApp[key] === 'boolean') {
      app[key] = rawApp[key] as boolean
    }
  }
  const services =
    Array.isArray(r.services) && r.services.every((s) => typeof s === 'string')
      ? (r.services as string[])
      : null
  return {
    level: pick(r.level, LEVELS, 'essential'),
    services,
    app,
    reminderDelay: pick(r.reminderDelay, DELAYS, 'eve'),
  }
}

export const PREF_KEY_OF_TYPE: Record<NotificationType, NotificationPrefKey> = {
  MENTION: 'mention',
  REMINDER: 'reminder',
  PATIENT_ADDED: 'added',
  APPOINTMENT_MOVED: 'moved',
  APPOINTMENT_CANCELLED: 'moved',
  ABSENT: 'absent',
  DIAGNOSTIC_DUE: 'diag',
  PATHWAY_END: 'end',
  SLOT_ALMOST_FULL: 'full',
  TASK_DUE: 'due',
}

export const allows = (
  prefs: NotificationPrefs,
  type: NotificationType,
  serviceId: string,
): boolean =>
  prefs.app[PREF_KEY_OF_TYPE[type]] &&
  (prefs.services === null || prefs.services.includes(serviceId))
