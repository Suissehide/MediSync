import type { Prisma } from '../../../../generated/client'
import type { ThematicRole } from '../../../../generated/enums'
import type { IocContainer } from '../../../types/application/ioc'
import type {
  DiagnosticDueRow,
  MemberBySoignantRow,
  NotificationScheduleRepositoryInterface,
  PathwayEndedRow,
  ScheduledNotificationRow,
  SoignantOfRoleRow,
  TaskDueRow,
  UpcomingAppointmentRow,
} from '../../../types/infra/orm/repositories/notification-schedule.repository.interface'
import { soignantLinksInclude } from '../includes/slot-template.include'
import type { PostgresPrismaClient } from '../postgres-client'

const patientName = (p: { firstName: string; lastName: string }) =>
  `${p.lastName.toUpperCase()} ${p.firstName}`

// Hors tenant : aucune methode ne lit tenantContext.scope() (leverait sous runAsSystem).
class NotificationScheduleRepository
  implements NotificationScheduleRepositoryInterface
{
  private readonly prisma: PostgresPrismaClient

  constructor({ postgresOrm }: IocContainer) {
    this.prisma = postgresOrm.prisma
  }

  async upcomingAppointments(
    from: Date,
    to: Date,
  ): Promise<UpcomingAppointmentRow[]> {
    const rows = await this.prisma.appointment.findMany({
      where: {
        startDate: { gte: from, lte: to },
        slot: { archivedAt: null },
        appointmentPatients: { some: {} },
      },
      include: {
        thematic: true,
        slot: {
          include: {
            slotTemplate: {
              include: {
                ...soignantLinksInclude,
                location: true,
                thematic: true,
              },
            },
          },
        },
      },
    })
    return rows.map((a) => ({
      establishmentId: a.establishmentId,
      serviceId: a.serviceId,
      appointmentId: a.id,
      slotId: a.slotID,
      startDate: a.startDate,
      thematicName:
        a.thematic?.name ?? a.slot.slotTemplate.thematic?.name ?? null,
      locationName: a.slot.slotTemplate.location?.name ?? null,
      soignantIds: a.slot.slotTemplate.soignantLinks.map((l) => l.soignantId),
    }))
  }

  async entryDatesWithoutDiagnostic(
    from: Date,
    to: Date,
  ): Promise<DiagnosticDueRow[]> {
    const rows = await this.prisma.patientServiceFile.findMany({
      where: { entryDate: { gte: from, lte: to }, diagnostics: { none: {} } },
      select: {
        id: true,
        establishmentId: true,
        serviceId: true,
        patientId: true,
        entryDate: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    })
    return rows
      .filter((r): r is typeof r & { entryDate: Date } => r.entryDate !== null)
      .map((r) => ({
        establishmentId: r.establishmentId,
        serviceId: r.serviceId,
        patientServiceFileId: r.id,
        patientId: r.patientId,
        patientName: patientName(r.patient),
        entryDate: r.entryDate,
      }))
  }

  // Deux passes bornees plutot qu'une lecture de tous les rendez-vous de parcours du depot : la
  // premiere ne cherche que les parcours ayant une seance (non annulee) finissant dans [from, to]
  // (condition necessaire pour que leur derniere seance tombe dans cette fenetre) ; la seconde ne
  // relit que CES parcours, en entier, pour calculer la vraie derniere date et detecter un Bilan
  // de fin (prevu ou honore, sans filtre de date). Un creneau annule (archivedAt) est ignore dans
  // les deux passes : il ne doit ni fixer la derniere date, ni comptabiliser comme un Bilan de fin.
  async pathwaysEnded(from: Date, to: Date): Promise<PathwayEndedRow[]> {
    const candidats = await this.prisma.appointment.findMany({
      where: {
        endDate: { gte: from, lte: to },
        slot: { pathwayID: { not: null }, archivedAt: null },
        appointmentPatients: { some: {} },
      },
      select: { slot: { select: { pathwayID: true } } },
    })
    const pathwayIds = [
      ...new Set(
        candidats
          .map((a) => a.slot.pathwayID)
          .filter((id): id is string => id !== null),
      ),
    ]
    if (pathwayIds.length === 0) {
      return []
    }

    const rows = await this.prisma.appointment.findMany({
      where: { slot: { pathwayID: { in: pathwayIds }, archivedAt: null } },
      select: {
        establishmentId: true,
        serviceId: true,
        endDate: true,
        thematic: { select: { role: true } },
        slot: {
          select: {
            pathwayID: true,
            slotTemplate: { select: { thematic: { select: { role: true } } } },
          },
        },
        appointmentPatients: {
          select: {
            patientId: true,
            patient: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })

    const last = new Map<string, PathwayEndedRow>()
    const hasBilanDeFin = new Set<string>()
    for (const a of rows) {
      const pathwayId = a.slot.pathwayID
      if (!pathwayId) {
        continue
      }
      const role =
        a.thematic?.role ?? a.slot.slotTemplate.thematic?.role ?? null
      for (const ap of a.appointmentPatients) {
        const key = `${pathwayId}:${ap.patientId}`
        if (role === 'BILAN_DE_FIN') {
          hasBilanDeFin.add(key)
        }
        const current = last.get(key)
        if (!current || a.endDate > current.lastDate) {
          last.set(key, {
            establishmentId: a.establishmentId,
            serviceId: a.serviceId,
            pathwayId,
            patientId: ap.patientId,
            patientName: patientName(ap.patient),
            lastDate: a.endDate,
          })
        }
      }
    }

    return [...last.entries()]
      .filter(([key]) => !hasBilanDeFin.has(key))
      .map(([, row]) => row)
      .filter((row) => row.lastDate >= from && row.lastDate <= to)
  }

  async tasksDue(day: Date): Promise<TaskDueRow[]> {
    const rows = await this.prisma.task.findMany({
      where: { dueDate: day, doneAt: null },
      include: { assignees: true, soignants: true },
    })
    return rows
      .filter((t): t is typeof t & { dueDate: Date } => t.dueDate !== null)
      .map((t) => ({
        establishmentId: t.establishmentId,
        serviceId: t.serviceId,
        taskId: t.id,
        text: t.text,
        dueDate: t.dueDate,
        assigneeUserIds: t.assignees.map((a) => a.userId),
        soignantIds: t.soignants.map((s) => s.soignantId),
      }))
  }

  async membersBySoignant(
    serviceIds: string[],
  ): Promise<MemberBySoignantRow[]> {
    if (serviceIds.length === 0) {
      return []
    }
    const rows = await this.prisma.serviceMembership.findMany({
      where: {
        serviceId: { in: serviceIds },
        role: { not: 'LECTURE' },
        soignantId: { not: null },
        establishmentMembership: { user: { deactivatedAt: null } },
      },
      select: {
        serviceId: true,
        soignantId: true,
        establishmentMembership: { select: { userId: true } },
      },
    })
    return rows
      .filter(
        (r): r is typeof r & { soignantId: string } => r.soignantId !== null,
      )
      .map((r) => ({
        serviceId: r.serviceId,
        soignantId: r.soignantId,
        userId: r.establishmentMembership.userId,
      }))
  }

  soignantsOfThematicRole(
    serviceIds: string[],
    role: ThematicRole,
  ): Promise<SoignantOfRoleRow[]> {
    if (serviceIds.length === 0) {
      return Promise.resolve([])
    }
    return this.prisma.soignantThematic.findMany({
      where: { serviceId: { in: serviceIds }, thematic: { role } },
      select: { serviceId: true, soignantId: true },
    })
  }

  async purgeOlderThan(date: Date): Promise<number> {
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: date } },
    })
    return count
  }

  async createNotifications(rows: ScheduledNotificationRow[]): Promise<number> {
    if (rows.length === 0) {
      return 0
    }
    const { count } = await this.prisma.notification.createMany({
      data: rows.map((r) => ({
        ...r,
        payload: r.payload as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    })
    return count
  }
}

export { NotificationScheduleRepository }
