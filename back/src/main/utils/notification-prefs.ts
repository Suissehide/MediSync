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
export type Digest = 'now' | 'daily'
export type NotificationPrefs = {
  level: NotificationLevel
  services: string[] | null
  app: Record<NotificationPrefKey, boolean>
  mail: Record<NotificationPrefKey, boolean>
  reminderDelay: ReminderDelay
  digest: Digest
}

const LEVELS: readonly NotificationLevel[] = ['all', 'essential', 'custom']
const DELAYS: readonly ReminderDelay[] = ['eve', '2h', '1h']
const DIGESTS: readonly Digest[] = ['now', 'daily']
const allOn = () =>
  Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, true])) as Record<
    NotificationPrefKey,
    boolean
  >
const allOff = () =>
  Object.fromEntries(NOTIFICATION_PREF_KEYS.map((k) => [k, false])) as Record<
    NotificationPrefKey,
    boolean
  >

const ESSENTIAL_MAIL: readonly NotificationPrefKey[] = [
  'reminder',
  'moved',
  'mention',
]

export const presetMail = (
  level: 'all' | 'essential',
): Record<NotificationPrefKey, boolean> =>
  level === 'all'
    ? allOn()
    : (Object.fromEntries(
        NOTIFICATION_PREF_KEYS.map((k) => [k, ESSENTIAL_MAIL.includes(k)]),
      ) as Record<NotificationPrefKey, boolean>)

export const DEFAULT_PREFS: NotificationPrefs = {
  level: 'custom',
  services: null,
  app: allOn(),
  mail: allOff(),
  reminderDelay: 'eve',
  digest: 'now',
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
  // Une preference stockee sans `mail` (etape 2, ou nouveau compte) : aucun e-mail, niveau personnalise.
  const hasMail = r.mail && typeof r.mail === 'object'
  const rawMail = hasMail ? (r.mail as Record<string, unknown>) : {}
  const mail = allOff()
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof rawMail[key] === 'boolean') {
      mail[key] = rawMail[key] as boolean
    }
  }
  return {
    level: hasMail ? pick(r.level, LEVELS, 'custom') : 'custom',
    services,
    app,
    mail,
    reminderDelay: pick(r.reminderDelay, DELAYS, 'eve'),
    digest: pick(r.digest, DIGESTS, 'now'),
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

// Liste sans aucun service actuel du compte : perimee, elle vaut « tous », comme a l'ecran.
export const withLiveServices = (
  prefs: NotificationPrefs,
  current: readonly string[],
): NotificationPrefs =>
  prefs.services?.some((s) => current.includes(s)) === false
    ? { ...prefs, services: null }
    : prefs

export const allows = (
  prefs: NotificationPrefs,
  type: NotificationType,
  serviceId: string,
): boolean =>
  prefs.app[PREF_KEY_OF_TYPE[type]] &&
  (prefs.services === null || prefs.services.includes(serviceId))

export const mailAllows = (
  prefs: NotificationPrefs,
  type: NotificationType,
  serviceId: string,
): boolean =>
  prefs.mail[PREF_KEY_OF_TYPE[type]] &&
  (prefs.services === null || prefs.services.includes(serviceId))
