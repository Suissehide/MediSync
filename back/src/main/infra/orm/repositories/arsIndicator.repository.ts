import type { IocContainer } from '../../../types/application/ioc'
import type { ArsIndicatorRepositoryInterface } from '../../../types/infra/orm/repositories/arsIndicator.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { ArsFile } from '../../../utils/ars-indicators'
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

  async findCohort(): Promise<ArsFile[]> {
    const { serviceId } = this.scope
    const files = await this.prisma.patientServiceFile.findMany({
      where: this.scope,
      select: {
        patientId: true,
        entryDate: true,
        orientation: true,
        patient: {
          select: {
            appointmentPatients: {
              // Isolation : les rendez-vous du patient dans un AUTRE service ne comptent pas.
              where: { serviceId },
              select: {
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
            },
          },
        },
      },
    })

    return files.map((f) => ({
      patientId: f.patientId,
      entryDate: f.entryDate,
      orientation: f.orientation,
      presences: f.patient.appointmentPatients.map((ap) => ({
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
      })),
    }))
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
