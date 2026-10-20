import {
  AlarmClock,
  Bell,
  CalendarClock,
  CalendarX,
  ClipboardList,
  Flag,
  ListTodo,
  type LucideIcon,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { ServiceMember } from '@/types/serviceMember.ts'
import type {
  MentionPayload,
  Notification,
  NotificationType,
} from '@/types/task.ts'
import { memberName } from './inbox.utils.ts'

export type NotificationTarget =
  | { kind: 'task'; taskId: string }
  | { kind: 'agenda'; date: string }
  | { kind: 'patient'; patientId: string }

// Table `TYPES` du handoff (tour 15), couleurs/icones figees par la spec d'etape 2.
export const NOTIFICATION_TYPES: Record<
  NotificationType,
  { icon: LucideIcon; color: string; tint: string; kind: string; cta: string }
> = {
  PATIENT_ADDED: {
    icon: UserPlus,
    color: '#2563eb',
    tint: '#eff6ff',
    kind: 'Patient ajouté',
    cta: 'Ouvrir le RDV',
  },
  REMINDER: {
    icon: AlarmClock,
    color: '#7c3aed',
    tint: '#f5f3ff',
    kind: 'Rappel',
    cta: 'Ouvrir le RDV',
  },
  APPOINTMENT_MOVED: {
    icon: CalendarClock,
    color: '#b45309',
    tint: '#fffbeb',
    kind: 'RDV modifié',
    cta: 'Ouvrir le RDV',
  },
  APPOINTMENT_CANCELLED: {
    icon: CalendarX,
    color: '#b91c1c',
    tint: '#fef2f2',
    kind: 'RDV annulé',
    cta: "Voir l'agenda",
  },
  ABSENT: {
    icon: UserX,
    color: '#be185d',
    tint: '#fdf2f8',
    kind: 'Absence',
    cta: 'Ouvrir la fiche',
  },
  SLOT_ALMOST_FULL: {
    icon: Users,
    color: '#0891b2',
    tint: '#ecfeff',
    kind: 'Créneau',
    cta: 'Voir le créneau',
  },
  PATHWAY_END: {
    icon: Flag,
    color: '#15803d',
    tint: '#f0fdf4',
    kind: 'Fin de parcours',
    cta: 'Ouvrir la fiche',
  },
  DIAGNOSTIC_DUE: {
    icon: ClipboardList,
    color: '#334155',
    tint: '#f1f5f9',
    kind: 'Diagnostic',
    cta: 'Ouvrir la fiche',
  },
  TASK_DUE: {
    icon: CalendarClock,
    color: '#b91c1c',
    tint: '#fef2f2',
    kind: 'Échéance',
    cta: 'Ouvrir la tâche',
  },
  MENTION: {
    icon: ListTodo,
    color: '#0f766e',
    tint: '#f0fdfa',
    kind: 'Mention',
    cta: 'Ouvrir la tâche',
  },
}

// Type inconnu (donnee serveur en avance sur ce front, ou corrompue) : une pastille neutre sans
// lien plutot qu'un plantage du panneau entier.
const FALLBACK_TYPE: {
  icon: LucideIcon
  color: string
  tint: string
  kind: string
  cta: string
} = {
  icon: Bell,
  color: '#334155',
  tint: '#f1f5f9',
  kind: 'Notification',
  cta: '',
}

export const notificationTypeOf = (
  type: NotificationType,
): (typeof NOTIFICATION_TYPES)[NotificationType] =>
  NOTIFICATION_TYPES[type] ?? FALLBACK_TYPE

const str = (p: Record<string, unknown>, key: string): string =>
  typeof p[key] === 'string' ? (p[key] as string) : ''
const num = (p: Record<string, unknown>, key: string): number =>
  typeof p[key] === 'number' ? (p[key] as number) : 0
const obj = (
  p: Record<string, unknown>,
  key: string,
): Record<string, unknown> =>
  typeof p[key] === 'object' && p[key] !== null
    ? (p[key] as Record<string, unknown>)
    : {}

// Les dates des seances/echeances sont des horaires de Paris stockes en UTC naif (meme
// convention que le reste du front, ex. `dayjs.utc(...)`) : lire les champs en UTC les rend tels
// quels, independamment du fuseau de la machine qui execute le test ou le navigateur.
const sessionDate = (iso: string): string => {
  const d = new Date(iso)
  const opts = { timeZone: 'UTC' } as const
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short', ...opts })
  const dm = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    ...opts,
  })
  const hm = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  })
  return `${weekday} ${dm} à ${hm}`
}

const dayLabel = (iso: string): string => {
  const d = new Date(iso)
  const opts = { timeZone: 'UTC' } as const
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short', ...opts })
  const dm = d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    ...opts,
  })
  return `${weekday} ${dm}`
}

const bold = (text: string): ReactNode => (
  <b className="font-semibold">{text}</b>
)

export const notificationText = (
  n: Notification,
  members: ServiceMember[],
): ReactNode => {
  const p = n.payload
  switch (n.type) {
    case 'PATIENT_ADDED': {
      const patient = str(p, 'patientName')
      const count = num(p, 'count')
      const date = sessionDate(str(p, 'startDate'))
      if (count > 1) {
        return (
          <>
            {bold(patient)} a été ajouté à {count} de vos séances, la première
            le {date}
          </>
        )
      }
      return (
        <>
          {bold(patient)} a été ajouté à votre séance{' '}
          {bold(str(p, 'thematicName'))} du {date}
        </>
      )
    }
    case 'REMINDER': {
      const date = sessionDate(str(p, 'startDate'))
      const location = str(p, 'locationName')
      return (
        <>
          {date} : {bold(str(p, 'thematicName'))}
          {location ? `, ${location}` : ''}
        </>
      )
    }
    case 'APPOINTMENT_MOVED': {
      const before = obj(p, 'before')
      const after = obj(p, 'after')
      const beforeDate = str(before, 'startDate')
      const afterDate = str(after, 'startDate')
      if (beforeDate === afterDate) {
        return <>change de salle : {bold(str(after, 'locationName'))}</>
      }
      return (
        <>
          {bold(str(p, 'thematicName'))} du {sessionDate(beforeDate)} est
          déplacée au {bold(sessionDate(afterDate))}
        </>
      )
    }
    case 'APPOINTMENT_CANCELLED': {
      return (
        <>
          {bold(str(p, 'thematicName'))} du {sessionDate(str(p, 'startDate'))}{' '}
          est annulée
        </>
      )
    }
    case 'ABSENT': {
      return (
        <>
          {bold(str(p, 'patientName'))} était absent à{' '}
          {bold(str(p, 'thematicName'))} du {sessionDate(str(p, 'startDate'))},
          sans justification
        </>
      )
    }
    case 'SLOT_ALMOST_FULL': {
      return (
        <>
          Plus qu'une place à {bold(str(p, 'thematicName'))} du{' '}
          {sessionDate(str(p, 'startDate'))}
        </>
      )
    }
    case 'DIAGNOSTIC_DUE': {
      return (
        <>
          Diagnostic éducatif à réaliser pour {bold(str(p, 'patientName'))},
          inclus le {dayLabel(str(p, 'entryDate'))}
        </>
      )
    }
    case 'PATHWAY_END': {
      return (
        <>
          {bold(str(p, 'patientName'))} a terminé son parcours. Bilan de fin à
          réaliser
        </>
      )
    }
    case 'TASK_DUE': {
      return <>Échéance aujourd'hui : {bold(str(p, 'text'))}</>
    }
    case 'MENTION': {
      const mention = p as MentionPayload
      return (
        <>
          {bold(memberName(members, mention.authorId))} vous a mentionné dans
          une tâche : {mention.text}
        </>
      )
    }
    default:
      return null
  }
}

export const notificationTarget = (n: Notification): NotificationTarget => {
  const p = n.payload
  switch (n.type) {
    case 'MENTION':
      return { kind: 'task', taskId: (p as MentionPayload).taskId }
    case 'TASK_DUE':
      return { kind: 'task', taskId: str(p, 'taskId') }
    case 'ABSENT':
    case 'DIAGNOSTIC_DUE':
    case 'PATHWAY_END':
      return { kind: 'patient', patientId: str(p, 'patientId') }
    case 'APPOINTMENT_MOVED':
      return {
        kind: 'agenda',
        date: str(obj(p, 'after'), 'startDate').slice(0, 10),
      }
    default:
      return { kind: 'agenda', date: str(p, 'startDate').slice(0, 10) }
  }
}
