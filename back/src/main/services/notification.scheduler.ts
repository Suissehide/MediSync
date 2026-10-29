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
import type { Logger } from '../types/utils/logger'
import { sessionInstant } from '../utils/date'
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

// 'eve' : 18h Paris la veille du jour stocke ; '2h'/'1h' depuis l'instant reel de la seance.
export const reminderTime = (startDate: Date, delay: ReminderDelay): Date => {
  if (delay === 'eve') {
    const veille = dayjs.utc(startDate).subtract(1, 'day').format('YYYY-MM-DD')
    return dayjs.tz(`${veille} 18:00`, PARIS).toDate()
  }
  return dayjs(sessionInstant(startDate))
    .subtract(delay === '2h' ? 2 : 1, 'hour')
    .toDate()
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
    if (!(at <= now && now < sessionInstant(a.startDate))) {
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
  private readonly logger: Logger

  constructor({
    notificationScheduleRepository,
    userRepository,
    logger,
  }: IocContainer) {
    this.notificationScheduleRepository = notificationScheduleRepository
    this.userRepository = userRepository
    this.logger = logger
  }

  async runOnce(now: Date): Promise<{ created: number; purged: number }> {
    const steps: [string, () => Promise<number>][] = [
      ['reminders', () => this.#reminders(now)],
      ['diagnostics', () => this.#diagnostics(now)],
      ['pathwayEnds', () => this.#pathwayEnds(now)],
      ['tasksDue', () => this.#tasksDue(now)],
    ]
    let created = 0
    for (const [name, step] of steps) {
      created += await this.#guarded(name, step)
    }
    const purged = await this.#guarded('purge', () =>
      this.notificationScheduleRepository.purgeOlderThan(
        dayjs(now).subtract(30, 'day').toDate(),
      ),
    )
    return { created, purged }
  }

  // 33 h : le stocke depasse l'instant reel d'1 a 2 h, la veille 18h d'une seance tardive reste couverte.
  async #reminders(now: Date): Promise<number> {
    const repo = this.notificationScheduleRepository
    const appointments = await repo.upcomingAppointments(
      now,
      dayjs(now).add(33, 'hour').toDate(),
    )
    if (appointments.length === 0) {
      return 0
    }
    const members = await repo.membersBySoignant(
      appointments.map((a) => a.serviceId),
    )
    const targets = reminderTargetsOf(appointments, members)
    const prefs = await this.userRepository.findNotificationPrefsMany([
      ...new Set(targets.map((r) => r.userId)),
    ])
    return this.#create(reminderCandidatesOf(targets, prefs, now), prefs)
  }

  async #diagnostics(now: Date): Promise<number> {
    const repo = this.notificationScheduleRepository
    const rows = await repo.entryDatesWithoutDiagnostic(
      dayjs(now).subtract(37, 'day').toDate(),
      dayjs(now).subtract(7, 'day').toDate(),
    )
    if (rows.length === 0) {
      return 0
    }
    const serviceIds = rows.map((d) => d.serviceId)
    const members = await repo.membersBySoignant(serviceIds)
    const soignants = await repo.soignantsOfThematicRole(
      serviceIds,
      'DIAGNOSTIC_EDUCATIF',
    )
    return this.#create(diagnosticCandidates(rows, members, soignants))
  }

  async #pathwayEnds(now: Date): Promise<number> {
    const repo = this.notificationScheduleRepository
    const rows = await repo.pathwaysEnded(
      dayjs(now).subtract(30, 'day').toDate(),
      dayjs(now).tz(PARIS).subtract(1, 'day').endOf('day').toDate(),
    )
    if (rows.length === 0) {
      return 0
    }
    const serviceIds = rows.map((p) => p.serviceId)
    const members = await repo.membersBySoignant(serviceIds)
    const soignants = await repo.soignantsOfThematicRole(
      serviceIds,
      'BILAN_DE_FIN',
    )
    return this.#create(pathwayCandidates(rows, members, soignants))
  }

  async #tasksDue(now: Date): Promise<number> {
    if (dayjs(now).tz(PARIS).hour() < 7) {
      return 0
    }
    const repo = this.notificationScheduleRepository
    const rows = await repo.tasksDue(parisDay(now))
    if (rows.length === 0) {
      return 0
    }
    const members = await repo.membersBySoignant(rows.map((t) => t.serviceId))
    return this.#create(taskCandidates(rows, members))
  }

  async #create(
    candidates: Candidate[],
    known?: Map<string, NotificationPrefs>,
  ): Promise<number> {
    if (candidates.length === 0) {
      return 0
    }
    const prefs =
      known ??
      (await this.userRepository.findNotificationPrefsMany([
        ...new Set(candidates.map((c) => c.userId)),
      ]))
    const kept: ScheduledNotificationRow[] = candidates.filter((c) => {
      const p = prefs.get(c.userId)
      return p ? allows(p, c.type, c.serviceId) : true
    })
    return this.notificationScheduleRepository.createNotifications(kept)
  }

  // Une etape en echec n'arrete pas les suivantes ; seule la classe de l'erreur va au journal.
  async #guarded(name: string, work: () => Promise<number>): Promise<number> {
    try {
      return await work()
    } catch (err) {
      const errorClass =
        err instanceof Error ? err.constructor.name : typeof err
      this.logger.error(`Notifications ${name} failed [${errorClass}]`)
      return 0
    }
  }
}

export { NotificationScheduler }
