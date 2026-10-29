import type { IocContainer } from '../../../types/application/ioc'
import type {
  NotificationContextRepositoryInterface,
  SessionSnapshot,
  SlotOccupancy,
} from '../../../types/infra/orm/repositories/notification-context.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import { soignantLinksInclude } from '../includes/slot-template.include'
import type { PostgresPrismaClient } from '../postgres-client'

// Meme forme que `appointmentWithSlotInclude` (appointment.repository.ts), deja autorisee.
const sessionInclude = {
  thematic: true,
  appointmentPatients: { include: { patient: true } },
  slot: {
    include: {
      slotTemplate: {
        include: { ...soignantLinksInclude, location: true, thematic: true },
      },
    },
  },
} as const

const patientName = (p: { firstName: string; lastName: string }) =>
  `${p.lastName.toUpperCase()} ${p.firstName}`

class NotificationContextRepository
  implements NotificationContextRepositoryInterface
{
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  async sessions(appointmentIds: string[]): Promise<SessionSnapshot[]> {
    if (appointmentIds.length === 0) {
      return []
    }
    const rows = await this.prisma.appointment.findMany({
      where: { id: { in: appointmentIds }, ...this.tenantContext.scope() },
      include: sessionInclude,
    })
    return rows.map((a) => ({
      appointmentId: a.id,
      slotId: a.slotID,
      startDate: a.startDate,
      thematicName:
        a.thematic?.name ?? a.slot.slotTemplate.thematic?.name ?? null,
      locationName: a.slot.slotTemplate.location?.name ?? null,
      soignantIds: a.slot.slotTemplate.soignantLinks.map((l) => l.soignantId),
      patients: a.appointmentPatients.map((ap) => ({
        id: ap.patientId,
        name: patientName(ap.patient),
      })),
    }))
  }

  async slotOccupancy(slotId: string): Promise<SlotOccupancy> {
    const slot = await this.prisma.slot.findFirst({
      where: { id: slotId, ...this.tenantContext.scope() },
      include: {
        slotTemplate: { include: { ...soignantLinksInclude, thematic: true } },
        appointments: { include: { appointmentPatients: true } },
      },
    })
    if (!slot) {
      return {
        capacity: 0,
        booked: 0,
        soignantIds: [],
        firstAppointmentId: null,
        startDate: new Date(0),
        thematicName: null,
      }
    }
    return {
      capacity: slot.slotTemplate.capacity ?? 1,
      booked: slot.appointments.reduce(
        (sum, a) => sum + a.appointmentPatients.length,
        0,
      ),
      soignantIds: slot.slotTemplate.soignantLinks.map((l) => l.soignantId),
      firstAppointmentId: slot.appointments[0]?.id ?? null,
      startDate: slot.startDate,
      thematicName: slot.slotTemplate.thematic?.name ?? null,
    }
  }
}

export { NotificationContextRepository }
