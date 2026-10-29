import type { NotificationType } from '../../../generated/enums'
import type { Mail } from '../../types/infra/mail/mailer.interface'
import { escapeHtml, layout } from './templates'

export type MailableNotification = {
  type: NotificationType
  payload: Record<string, unknown>
}

const CTA = 'Ouvrir MediSync'
const FOOTER = 'Vous recevez cet e-mail selon vos préférences de notification.'
const COLLEAGUE_UNKNOWN = 'Un collègue'

const DATE_ONLY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')
const asNumber = (v: unknown): number => (typeof v === 'number' ? v : 0)
const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
const toDate = (v: unknown): Date =>
  v instanceof Date ? v : new Date(asString(v))
const isValidDate = (d: Date): boolean => !Number.isNaN(d.getTime())

// Heure stockee = heure de Paris ecrite en UTC : afficher en UTC, jamais reconvertir.
const formatDateOnly = (d: Date): string => DATE_ONLY.format(d)
const formatDateTime = (d: Date): string => {
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${formatDateOnly(d)} à ${hh}:${mm}`
}

// Date manquante ou invalide : jamais de throw ni de "Invalid Date", `null` pour degrader la phrase.
const safeDateTime = (v: unknown): string | null => {
  const d = toDate(v)
  return isValidDate(d) ? formatDateTime(d) : null
}
const safeDateOnly = (v: unknown): string | null => {
  const d = toDate(v)
  return isValidDate(d) ? formatDateOnly(d) : null
}

// Accole un connecteur ("du"/"le") a la date si elle est connue, sinon une formule neutre.
const withDate = (connector: string, v: unknown): string => {
  const date = safeDateTime(v)
  return date ? `${connector} ${date}` : 'prochainement'
}

const SUBJECTS: Record<NotificationType, string> = {
  REMINDER: 'MediSync : rappel de séance',
  PATIENT_ADDED: 'MediSync : patient ajouté',
  APPOINTMENT_MOVED: 'MediSync : séance modifiée',
  APPOINTMENT_CANCELLED: 'MediSync : séance annulée',
  ABSENT: 'MediSync : absence',
  SLOT_ALMOST_FULL: 'MediSync : créneau presque complet',
  DIAGNOSTIC_DUE: 'MediSync : diagnostic à réaliser',
  PATHWAY_END: 'MediSync : fin de parcours',
  TASK_DUE: 'MediSync : tâche à échéance',
  MENTION: 'MediSync : mention dans une tâche',
}

export const notificationSubject = (type: NotificationType): string =>
  SUBJECTS[type]

// Phrase sans donnee de sante : chaque branche ne lit que les champs nommes dans la spec.
export const notificationLine = ({
  type,
  payload,
}: MailableNotification): string => {
  switch (type) {
    case 'REMINDER':
      return `Rappel : vous avez une séance ${withDate('le', payload.startDate)}.`
    case 'PATIENT_ADDED': {
      const count = asNumber(payload.count)
      return count > 1
        ? `Un patient a été ajouté à ${count} de vos séances, la première ${withDate('le', payload.firstStartDate)}.`
        : `Un patient a été ajouté à votre séance ${withDate('du', payload.firstStartDate)}.`
    }
    case 'APPOINTMENT_MOVED': {
      const before = asRecord(payload.before)
      const after = asRecord(payload.after)
      const beforeDate = toDate(before.startDate)
      const afterDate = toDate(after.startDate)
      // Date absente ou invalide d'un cote ou de l'autre : jamais de comparaison NaN, phrase neutre.
      if (!isValidDate(beforeDate) || !isValidDate(afterDate)) {
        return 'Votre séance est modifiée.'
      }
      if (beforeDate.getTime() !== afterDate.getTime()) {
        return `Votre séance du ${formatDateTime(beforeDate)} est déplacée au ${formatDateTime(afterDate)}.`
      }
      return `Votre séance du ${formatDateTime(afterDate)} change de salle.`
    }
    case 'APPOINTMENT_CANCELLED':
      return `Votre séance ${withDate('du', payload.startDate)} est annulée.`
    case 'ABSENT':
      return `Un patient était absent à votre séance ${withDate('du', payload.startDate)}, sans justification.`
    case 'SLOT_ALMOST_FULL':
      return `Il ne reste qu'une place sur votre séance ${withDate('du', payload.startDate)}.`
    case 'DIAGNOSTIC_DUE': {
      const entry = safeDateOnly(payload.entryDate)
      return entry
        ? `Un diagnostic éducatif est à réaliser pour un patient inclus le ${entry}.`
        : 'Un diagnostic éducatif est à réaliser pour un patient inclus.'
    }
    case 'PATHWAY_END':
      return 'Un patient a terminé son parcours : bilan de fin à réaliser.'
    case 'TASK_DUE':
      return "Une de vos tâches arrive à échéance aujourd'hui."
    case 'MENTION': {
      const actor = asString(payload.actorName) || COLLEAGUE_UNKNOWN
      return `${actor} vous a mentionné dans une tâche.`
    }
    default:
      return ''
  }
}

export const notificationMail = (
  to: string,
  n: MailableNotification,
  frontUrl: string,
): Mail => {
  const line = notificationLine(n)
  return {
    to,
    subject: notificationSubject(n.type),
    text: `${line}\n\n${frontUrl}\n\n${FOOTER}`,
    html: layout([escapeHtml(line), escapeHtml(FOOTER)], frontUrl, CTA),
  }
}

export const digestMail = (
  to: string,
  items: MailableNotification[],
  day: Date,
  frontUrl: string,
): Mail => {
  const lines = items.map(notificationLine)
  const daySuffix = safeDateOnly(day)
  const subject = daySuffix
    ? `MediSync : vos notifications du ${daySuffix}`
    : 'MediSync : vos notifications'
  return {
    to,
    subject,
    text: `${lines.join('\n')}\n\n${frontUrl}\n\n${FOOTER}`,
    html: layout([...lines.map(escapeHtml), escapeHtml(FOOTER)], frontUrl, CTA),
  }
}
