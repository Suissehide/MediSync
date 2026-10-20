import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

import type { NotificationType } from '../../generated/enums'
import type { IocContainer } from '../types/application/ioc'
import type { NotificationSchedulerInterface } from '../types/domain/notification-scheduler.interface'
import type {
  DiagnosticDueRow,
  MemberBySoignantRow,
  NotificationScheduleRepositoryInterface,
  PathwayEndedRow,
  ScheduledNotificationRow,
  SoignantOfRoleRow,
  TaskDueRow,
  UpcomingAppointmentRow,
} from '../types/infra/orm/repositories/notification-schedule.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import {
  allows,
  type NotificationPrefs,
  type ReminderDelay,
} from '../utils/notification-prefs'

dayjs.extend(timezone)
dayjs.extend(utc)

const PARIS = 'Europe/Paris'

type Candidate = {
  establishmentId: string
  serviceId: string
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  dedupeKey: string
}
type ReminderTarget = { a: UpcomingAppointmentRow; userId: string }

// 'eve' : la veille a 18h heure de Paris. Reconstruit depuis une chaine de date plutot que
// d'enchainer .subtract(1,'day').hour(18) sur l'instant d'origine : ce dernier garde le DECALAGE
// de l'instant de depart (ete ou hiver), pas celui du jour cible — autour du changement d'heure
// (ex. 2026-10-25), le rappel partait a 19h/17h Paris au lieu de 18h.
export const reminderTime = (startDate: Date, delay: ReminderDelay): Date => {
  if (delay === '2h') {
    return dayjs(startDate).subtract(2, 'hour').toDate()
  }
  if (delay === '1h') {
    return dayjs(startDate).subtract(1, 'hour').toDate()
  }
  const veille = dayjs(startDate)
    .tz(PARIS)
    .subtract(1, 'day')
    .format('YYYY-MM-DD')
  return dayjs.tz(`${veille} 18:00`, PARIS).toDate()
}

// Jour calendaire de Paris de `now`, minuit UTC (convention de TaskDomain.create).
const parisDay = (now: Date): Date =>
  new Date(`${dayjs(now).tz(PARIS).format('YYYY-MM-DD')}T00:00:00Z`)

// Comptes qui incarnent un de ces soignants dans ce service, sans exclusion d'auteur (pas d'action).
const usersOf = (
  members: MemberBySoignantRow[],
  serviceId: string,
  soignantIds: string[],
): string[] => [
  ...new Set(
    members
      .filter(
        (m) => m.serviceId === serviceId && soignantIds.includes(m.soignantId),
      )
      .map((m) => m.userId),
  ),
]

const soignantsOf = (rows: SoignantOfRoleRow[], serviceId: string): string[] =>
  rows.filter((r) => r.serviceId === serviceId).map((r) => r.soignantId)

const diagnosticCandidates = (
  rows: DiagnosticDueRow[],
  members: MemberBySoignantRow[],
  soignants: SoignantOfRoleRow[],
): Candidate[] =>
  rows.flatMap((d) =>
    usersOf(members, d.serviceId, soignantsOf(soignants, d.serviceId)).map(
      (userId) => ({
        establishmentId: d.establishmentId,
        serviceId: d.serviceId,
        userId,
        type: 'DIAGNOSTIC_DUE' as const,
        payload: {
          patientId: d.patientId,
          patientName: d.patientName,
          entryDate: d.entryDate.toISOString().slice(0, 10),
        },
        dedupeKey: `diag:${d.patientServiceFileId}`,
      }),
    ),
  )

const pathwayCandidates = (
  rows: PathwayEndedRow[],
  members: MemberBySoignantRow[],
  soignants: SoignantOfRoleRow[],
): Candidate[] =>
  rows.flatMap((p) =>
    usersOf(members, p.serviceId, soignantsOf(soignants, p.serviceId)).map(
      (userId) => ({
        establishmentId: p.establishmentId,
        serviceId: p.serviceId,
        userId,
        type: 'PATHWAY_END' as const,
        payload: {
          patientId: p.patientId,
          patientName: p.patientName,
          pathwayId: p.pathwayId,
          lastDate: p.lastDate,
        },
        dedupeKey: `end:${p.pathwayId}:${p.patientId}`,
      }),
    ),
  )

const taskCandidates = (
  rows: TaskDueRow[],
  members: MemberBySoignantRow[],
): Candidate[] =>
  rows.flatMap((t) => {
    const recipients = new Set([
      ...t.assigneeUserIds,
      ...usersOf(members, t.serviceId, t.soignantIds),
    ])
    return [...recipients].map((userId) => ({
      establishmentId: t.establishmentId,
      serviceId: t.serviceId,
      userId,
      type: 'TASK_DUE' as const,
      payload: {
        taskId: t.taskId,
        text: t.text,
        dueDate: t.dueDate.toISOString().slice(0, 10),
      },
      dedupeKey: `due:${t.taskId}:${t.dueDate.toISOString().slice(0, 10)}`,
    }))
  })

const reminderTargetsOf = (
  rows: UpcomingAppointmentRow[],
  members: MemberBySoignantRow[],
): ReminderTarget[] =>
  rows.flatMap((a) =>
    usersOf(members, a.serviceId, a.soignantIds).map((userId) => ({
      a,
      userId,
    })),
  )

// Le delai depend du destinataire : calcule une fois les preferences resolues, pas avant.
const reminderCandidatesOf = (
  targets: ReminderTarget[],
  prefs: Map<string, NotificationPrefs>,
  now: Date,
): Candidate[] =>
  targets.flatMap(({ a, userId }) => {
    const delay = prefs.get(userId)?.reminderDelay ?? 'eve'
    const at = reminderTime(a.startDate, delay)
    if (!(at <= now && now < a.startDate)) {
      return []
    }
    return [
      {
        establishmentId: a.establishmentId,
        serviceId: a.serviceId,
        userId,
        type: 'REMINDER' as const,
        payload: {
          appointmentId: a.appointmentId,
          slotId: a.slotId,
          startDate: a.startDate,
          thematicName: a.thematicName,
          locationName: a.locationName,
        },
        dedupeKey: `reminder:${a.appointmentId}:${a.startDate.toISOString()}`,
      },
    ]
  })

// Planificateur (rappels, diagnostic, fin de parcours, echeances) et purge a 30 jours, sous le mode systeme.
class NotificationScheduler implements NotificationSchedulerInterface {
  private readonly notificationScheduleRepository: NotificationScheduleRepositoryInterface
  private readonly userRepository: UserRepositoryInterface

  constructor({
    notificationScheduleRepository,
    userRepository,
  }: IocContainer) {
    this.notificationScheduleRepository = notificationScheduleRepository
    this.userRepository = userRepository
  }

  async runOnce(now: Date): Promise<{ created: number; purged: number }> {
    const repo = this.notificationScheduleRepository

    const appointments = await repo.upcomingAppointments(
      now,
      dayjs(now).add(30, 'hour').toDate(),
    )
    const diagnostics = await repo.entryDatesWithoutDiagnostic(
      dayjs(now).subtract(37, 'day').toDate(),
      dayjs(now).subtract(7, 'day').toDate(),
    )
    const pathwayEnds = await repo.pathwaysEnded(
      dayjs(now).subtract(30, 'day').toDate(),
      dayjs(now).tz(PARIS).subtract(1, 'day').endOf('day').toDate(),
    )
    const parisHour = dayjs(now).tz(PARIS).hour()
    const tasksDue = parisHour >= 7 ? await repo.tasksDue(parisDay(now)) : []

    const serviceIds = [
      ...new Set([
        ...appointments.map((a) => a.serviceId),
        ...diagnostics.map((d) => d.serviceId),
        ...pathwayEnds.map((p) => p.serviceId),
        ...tasksDue.map((t) => t.serviceId),
      ]),
    ]
    const members = await repo.membersBySoignant(serviceIds)
    const diagSoignants = diagnostics.length
      ? await repo.soignantsOfThematicRole(serviceIds, 'DIAGNOSTIC_EDUCATIF')
      : []
    const endSoignants = pathwayEnds.length
      ? await repo.soignantsOfThematicRole(serviceIds, 'BILAN_DE_FIN')
      : []

    const reminderTargets = reminderTargetsOf(appointments, members)
    const candidates: Candidate[] = [
      ...diagnosticCandidates(diagnostics, members, diagSoignants),
      ...pathwayCandidates(pathwayEnds, members, endSoignants),
      ...taskCandidates(tasksDue, members),
    ]

    const allUserIds = [
      ...new Set([
        ...reminderTargets.map((r) => r.userId),
        ...candidates.map((c) => c.userId),
      ]),
    ]
    const prefs =
      await this.userRepository.findNotificationPrefsMany(allUserIds)

    const all: Candidate[] = [
      ...candidates,
      ...reminderCandidatesOf(reminderTargets, prefs, now),
    ]
    const kept: ScheduledNotificationRow[] = all.filter((c) => {
      const p = prefs.get(c.userId)
      return p ? allows(p, c.type, c.serviceId) : true
    })

    const created = await repo.createNotifications(kept)
    const purged = await repo.purgeOlderThan(
      dayjs(now).subtract(30, 'day').toDate(),
    )
    return { created, purged }
  }
}

export { NotificationScheduler }
