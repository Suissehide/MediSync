import type { NotificationType } from '../../generated/enums'
import type { IocContainer } from '../types/application/ioc'
import type { NotificationDispatcherInterface } from '../types/domain/notification-dispatcher.interface'
import type {
  MembershipRepositoryInterface,
  ServiceMemberRow,
} from '../types/infra/orm/repositories/membership.repository.interface'
import type { NotificationRepositoryInterface } from '../types/infra/orm/repositories/notification.repository.interface'
import type {
  NotificationContextRepositoryInterface,
  SessionSnapshot,
} from '../types/infra/orm/repositories/notification-context.repository.interface'
import type { UserRepositoryInterface } from '../types/infra/orm/repositories/user.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import { allows } from '../utils/notification-prefs'

type Row = {
  userId: string
  type: NotificationType
  payload: Record<string, unknown>
  dedupeKey?: string
}

// ponytail: une passe par appel, sans file ; une file si le volume l'exige un jour
class NotificationDispatcher implements NotificationDispatcherInterface {
  private readonly notificationContextRepository: NotificationContextRepositoryInterface
  private readonly membershipRepository: MembershipRepositoryInterface
  private readonly userRepository: UserRepositoryInterface
  private readonly notificationRepository: NotificationRepositoryInterface
  private readonly tenantContext: TenantContextInterface
  private readonly logger: Logger

  constructor({
    notificationContextRepository,
    membershipRepository,
    userRepository,
    notificationRepository,
    tenantContext,
    logger,
  }: IocContainer) {
    this.notificationContextRepository = notificationContextRepository
    this.membershipRepository = membershipRepository
    this.userRepository = userRepository
    this.notificationRepository = notificationRepository
    this.tenantContext = tenantContext
    this.logger = logger
  }

  // Jamais d'exception : appelee en tache de fond et directement par un domaine avant suppression.
  async snapshot(appointmentIds: string[]): Promise<SessionSnapshot[]> {
    try {
      return await this.notificationContextRepository.sessions(appointmentIds)
    } catch (err) {
      this.#logError('snapshot', err)
      return []
    }
  }

  patientsAdded(
    actorId: string,
    appointmentId: string,
    patientIds: string[],
  ): void {
    this.#safe(async () => {
      const [s] = await this.snapshot([appointmentId])
      if (!s) {
        return
      }
      const rows = s.patients
        .filter((p) => patientIds.includes(p.id))
        .map((p) => ({
          type: 'PATIENT_ADDED' as const,
          payload: {
            ...this.#session(s),
            actorId,
            patientId: p.id,
            patientName: p.name,
            count: 1,
            firstStartDate: s.startDate,
          },
        }))
      await this.#toSession(actorId, s.soignantIds, rows)
    })
  }

  absent(actorId: string, appointmentId: string, patientIds: string[]): void {
    this.#safe(async () => {
      const [s] = await this.snapshot([appointmentId])
      if (!s) {
        return
      }
      const rows = s.patients
        .filter((p) => patientIds.includes(p.id))
        .map((p) => ({
          type: 'ABSENT' as const,
          payload: {
            ...this.#session(s),
            actorId,
            patientId: p.id,
            patientName: p.name,
          },
        }))
      await this.#toSession(actorId, s.soignantIds, rows)
    })
  }

  // `after` : date du creneau, pour un deplacement au niveau du creneau (le rendez-vous ne bouge pas avec lui).
  moved(
    actorId: string,
    appointmentId: string,
    before: { startDate: Date; locationName: string | null },
    after?: { startDate: Date },
  ): void {
    this.#safe(async () => {
      const [s] = await this.snapshot([appointmentId])
      if (!s) {
        return
      }
      const resolvedAfter = {
        startDate: after?.startDate ?? s.startDate,
        locationName: s.locationName,
      }
      await this.#toSession(actorId, s.soignantIds, [
        {
          type: 'APPOINTMENT_MOVED',
          payload: {
            ...this.#session(s),
            actorId,
            before,
            after: resolvedAfter,
          },
        },
      ])
    })
  }

  cancelled(actorId: string, snapshots: SessionSnapshot[]): void {
    this.#safe(async () => {
      for (const s of snapshots.filter((x) => x.patients.length > 0)) {
        await this.#toSession(actorId, s.soignantIds, [
          {
            type: 'APPOINTMENT_CANCELLED',
            payload: { ...this.#session(s), actorId, patients: s.patients },
          },
        ])
      }
    })
  }

  enrolled(actorId: string, patientId: string, appointmentIds: string[]): void {
    this.#safe(async () => {
      const sessions = (await this.snapshot(appointmentIds)).sort(
        (a, b) => a.startDate.getTime() - b.startDate.getTime(),
      )
      const members = await this.#members()
      const bySoignantUser = new Map<string, SessionSnapshot[]>()
      for (const s of sessions) {
        for (const userId of this.#usersOf(members, s.soignantIds, actorId)) {
          bySoignantUser.set(userId, [...(bySoignantUser.get(userId) ?? []), s])
        }
      }
      const rows: Row[] = []
      for (const [userId, mine] of bySoignantUser) {
        const first = mine[0] as SessionSnapshot
        const patient = first.patients.find((p) => p.id === patientId)
        rows.push({
          userId,
          type: 'PATIENT_ADDED',
          payload: {
            ...this.#session(first),
            actorId,
            patientId,
            patientName: patient?.name ?? '',
            count: mine.length,
            firstStartDate: first.startDate,
          },
        })
      }
      await this.#write(rows)
      for (const slotId of new Set(sessions.map((s) => s.slotId))) {
        await this.#slotFilled(actorId, slotId)
      }
    })
  }

  slotFilled(actorId: string, slotId: string): void {
    this.#safe(() => this.#slotFilled(actorId, slotId))
  }

  async #slotFilled(actorId: string, slotId: string): Promise<void> {
    const o = await this.notificationContextRepository.slotOccupancy(slotId)
    if (o.capacity < 2 || o.capacity - o.booked !== 1) {
      return
    }
    const members = await this.#members()
    const rows = this.#usersOf(members, o.soignantIds, actorId).map(
      (userId) => ({
        userId,
        type: 'SLOT_ALMOST_FULL' as const,
        payload: {
          slotId,
          appointmentId: o.firstAppointmentId,
          startDate: o.startDate,
          thematicName: o.thematicName,
        },
        dedupeKey: `full:${slotId}`,
      }),
    )
    await this.#write(rows)
  }

  #session(s: SessionSnapshot) {
    return {
      appointmentId: s.appointmentId,
      slotId: s.slotId,
      startDate: s.startDate,
      thematicName: s.thematicName,
      locationName: s.locationName,
    }
  }

  #members(): Promise<ServiceMemberRow[]> {
    return this.membershipRepository.findServiceMembers()
  }

  // Soignants de la seance : actifs, hors LECTURE, jamais l'auteur de l'action.
  #usersOf(
    members: ServiceMemberRow[],
    soignantIds: string[],
    actorId: string,
  ): string[] {
    return [
      ...new Set(
        members
          .filter(
            (m) =>
              m.soignantId &&
              soignantIds.includes(m.soignantId) &&
              m.role !== 'LECTURE' &&
              m.establishmentMembership.user.deactivatedAt === null,
          )
          .map((m) => m.establishmentMembership.user.id),
      ),
    ].filter((id) => id !== actorId)
  }

  async #toSession(
    actorId: string,
    soignantIds: string[],
    rows: Omit<Row, 'userId'>[],
  ): Promise<void> {
    const users = this.#usersOf(await this.#members(), soignantIds, actorId)
    await this.#write(
      users.flatMap((userId) => rows.map((r) => ({ ...r, userId }))),
    )
  }

  async #write(rows: Row[]): Promise<void> {
    if (rows.length === 0) {
      return
    }
    const { serviceId } = this.tenantContext.scope()
    const prefs = await this.userRepository.findNotificationPrefsMany([
      ...new Set(rows.map((r) => r.userId)),
    ])
    const kept = rows.filter((r) => {
      const p = prefs.get(r.userId)
      return p ? allows(p, r.type, serviceId) : true
    })
    await this.notificationRepository.createMany(kept)
  }

  #safe(work: () => Promise<void>): void {
    work().catch((err) => this.#logError('dispatch', err))
  }

  // Jamais la valeur brute de l'erreur : seule sa classe va au journal (meme regle que les purges).
  #logError(context: string, err: unknown): void {
    const errorClass = err instanceof Error ? err.constructor.name : typeof err
    this.logger.error(`Notification ${context} failed [${errorClass}]`)
  }
}

export { NotificationDispatcher }
