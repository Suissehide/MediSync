import type { NotificationType } from '../../../generated/enums'
import type { Mail } from '../../types/infra/mail/mailer.interface'
import { escapeHtml, layout } from './templates'

export type MailableNotification = {
  type: NotificationType
  payload: Record<string, unknown>
}

const CTA = 'Ouvrir MediSync'
const FOOTER = 'Vous recevez cet e-mail selon vos préférences de notification.'

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

// Heure stockee = heure de Paris ecrite en UTC : afficher en UTC, jamais reconvertir.
const dateOnly = (v: unknown): string => DATE_ONLY.format(toDate(v))
const dateTime = (v: unknown): string => {
  const d = toDate(v)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dateOnly(d)} à ${hh}:${mm}`
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
    case 'REMINDER': {
      const room = asString(payload.locationName)
      return `Rappel : vous avez une séance le ${dateTime(payload.startDate)}${room ? `, ${room}` : ''}.`
    }
    case 'PATIENT_ADDED': {
      const count = asNumber(payload.count)
      const date = dateTime(payload.firstStartDate)
      return count > 1
        ? `Un patient a été ajouté à ${count} de vos séances, la première le ${date}.`
        : `Un patient a été ajouté à votre séance du ${date}.`
    }
    case 'APPOINTMENT_MOVED': {
      const before = asRecord(payload.before)
      const after = asRecord(payload.after)
      const beforeDate = toDate(before.startDate)
      const afterDate = toDate(after.startDate)
      if (beforeDate.getTime() !== afterDate.getTime()) {
        return `Votre séance du ${dateTime(beforeDate)} est déplacée au ${dateTime(afterDate)}.`
      }
      return `Votre séance du ${dateTime(afterDate)} change de salle : ${asString(after.locationName)}.`
    }
    case 'APPOINTMENT_CANCELLED':
      return `Votre séance du ${dateTime(payload.startDate)} est annulée.`
    case 'ABSENT':
      return `Un patient était absent à votre séance du ${dateTime(payload.startDate)}, sans justification.`
    case 'SLOT_ALMOST_FULL':
      return `Il ne reste qu'une place sur votre séance du ${dateTime(payload.startDate)}.`
    case 'DIAGNOSTIC_DUE':
      return `Un diagnostic éducatif est à réaliser pour un patient inclus le ${dateOnly(payload.entryDate)}.`
    case 'PATHWAY_END':
      return 'Un patient a terminé son parcours : bilan de fin à réaliser.'
    case 'TASK_DUE':
      return "Une de vos tâches arrive à échéance aujourd'hui."
    case 'MENTION':
      return `${asString(payload.actorName)} vous a mentionné dans une tâche.`
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
  return {
    to,
    subject: `MediSync : vos notifications du ${dateOnly(day)}`,
    text: `${lines.join('\n')}\n\n${frontUrl}\n\n${FOOTER}`,
    html: layout([...lines.map(escapeHtml), escapeHtml(FOOTER)], frontUrl, CTA),
  }
}
