import type { IocContainer } from '../../../types/application/ioc'
import type {
  ArsCohortRows,
  ArsIndicatorRepositoryInterface,
} from '../../../types/infra/orm/repositories/arsIndicator.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { ArsFile, ArsPresence } from '../../../utils/ars-indicators'
import type { PostgresPrismaClient } from '../postgres-client'

// Pas de borne de date basse : plusieurs indicateurs remontent jusqu'à la date d'entrée, qui
// précède souvent la période demandée.
// ponytail: charge tout le service en mémoire ; filtrer en base si un service pèse trop.
class ArsIndicatorRepository implements ArsIndicatorRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.tenantContext = tenantContext
  }

  private get scope() {
    return this.tenantContext.scope()
  }

  // Deux lectures plutôt qu'un `include` imbriqué depuis le sous-dossier : les rendez-vous du
  // service ne sont pas tous rattachés à un sous-dossier, et partir d'`AppointmentPatient` (modèle
  // de service) évite la traversée établissement→service que le garde-fou doit arbitrer.
  async findCohort(): Promise<ArsCohortRows> {
    const [serviceFiles, appointmentPatients] = await Promise.all([
      this.prisma.patientServiceFile.findMany({
        where: this.scope,
        select: { patientId: true, entryDate: true, orientation: true },
      }),
      this.prisma.appointmentPatient.findMany({
        where: this.scope,
        select: {
          patientId: true,
          status: true,
          accompanying: true,
          appointment: {
            select: {
              startDate: true,
              type: true,
              slotID: true,
              thematic: { select: { name: true } },
              slot: {
                select: {
                  slotTemplate: {
                    select: {
                      isIndividual: true,
                      thematic: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    const presences: ArsPresence[] = appointmentPatients.map((ap) => ({
      patientId: ap.patientId,
      date: ap.appointment.startDate,
      type: ap.appointment.type,
      individual: ap.appointment.slot.slotTemplate.isIndividual,
      slotId: ap.appointment.slotID,
      thematicName:
        ap.appointment.thematic?.name ??
        ap.appointment.slot.slotTemplate.thematic?.name ??
        null,
      honored: ap.status === 'yes',
      accompanied: ap.accompanying === 'Oui',
    }))

    const byPatient = new Map<string, ArsPresence[]>()
    for (const p of presences) {
      byPatient.set(p.patientId, [...(byPatient.get(p.patientId) ?? []), p])
    }

    const files: ArsFile[] = serviceFiles.map((f) => ({
      patientId: f.patientId,
      entryDate: f.entryDate,
      orientation: f.orientation,
      presences: byPatient.get(f.patientId) ?? [],
    }))

    return { files, presences }
  }

  async findServiceName(): Promise<string> {
    const { serviceId, establishmentId } = this.scope
    const service = await this.prisma.service.findUniqueOrThrow({
      where: { id_establishmentId: { id: serviceId, establishmentId } },
      select: { name: true },
    })
    return service.name
  }
}

export { ArsIndicatorRepository }
