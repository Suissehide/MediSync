import type { IocContainer } from '../../../types/application/ioc'
import type { IndicatorCohortRepositoryInterface } from '../../../types/infra/orm/repositories/indicatorCohort.repository.interface'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import {
  ACCOMPANYING_YES,
  type CohortFile,
  type CohortPresence,
  type DateRange,
  type IndicatorCohort,
} from '../../../utils/indicators/cohort'
import { asValues } from '../../../utils/service-field-types'
import type { PostgresPrismaClient } from '../postgres-client'

// Libellé lisible d'un parcours : son modèle (ou son absence) et sa date de début.
const libelleParcours = (pathway: {
  startDate: Date
  template: { name: string } | null
}): string => {
  const [annee, mois, jour] = pathway.startDate
    .toISOString()
    .slice(0, 10)
    .split('-')
  return `${pathway.template?.name ?? 'Parcours sans modèle'} — ${jour}/${mois}/${annee}`
}

// Pas de borne de date basse : plusieurs indicateurs remontent jusqu'à la date d'entrée, qui
// précède souvent la période demandée.
// ponytail: charge tout le service en mémoire ; filtrer en base si un service pèse trop.
class IndicatorCohortRepository implements IndicatorCohortRepositoryInterface {
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
  async findCohort(range: DateRange): Promise<IndicatorCohort> {
    const [serviceFiles, appointmentPatients] = await Promise.all([
      this.prisma.patientServiceFile.findMany({
        where: this.scope,
        select: {
          patientId: true,
          entryDate: true,
          exitDate: true,
          data: true,
          clinicalData: true,
        },
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
              thematic: { select: { name: true, role: true } },
              slot: {
                select: {
                  startDate: true,
                  endDate: true,
                  pathway: {
                    select: {
                      id: true,
                      startDate: true,
                      template: { select: { id: true, name: true } },
                    },
                  },
                  slotTemplate: {
                    select: {
                      isIndividual: true,
                      thematic: { select: { name: true, role: true } },
                      soignantLinks: {
                        select: { soignant: { select: { name: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    const presences: CohortPresence[] = appointmentPatients.map((ap) => {
      const thematique =
        ap.appointment.thematic ?? ap.appointment.slot.slotTemplate.thematic
      return {
        patientId: ap.patientId,
        date: ap.appointment.startDate,
        type: ap.appointment.type,
        individual: ap.appointment.slot.slotTemplate.isIndividual,
        slotId: ap.appointment.slotID,
        thematicName: thematique?.name ?? null,
        thematicRole: thematique?.role ?? null,
        honored: ap.status === 'yes',
        accompanied: ap.accompanying === ACCOMPANYING_YES,
        status: ap.status,
        pathwayId: ap.appointment.slot.pathway?.id ?? null,
        pathwayLabel: ap.appointment.slot.pathway
          ? libelleParcours(ap.appointment.slot.pathway)
          : null,
        pathwayTemplateId: ap.appointment.slot.pathway?.template?.id ?? null,
        slotMinutes:
          (ap.appointment.slot.endDate.getTime() -
            ap.appointment.slot.startDate.getTime()) /
          60_000,
        soignants: ap.appointment.slot.slotTemplate.soignantLinks.map(
          (l) => l.soignant.name,
        ),
      }
    })

    const byPatient = new Map<string, CohortPresence[]>()
    for (const p of presences) {
      byPatient.set(p.patientId, [...(byPatient.get(p.patientId) ?? []), p])
    }

    const files: CohortFile[] = serviceFiles.map((f) => ({
      patientId: f.patientId,
      entryDate: f.entryDate,
      exitDate: f.exitDate,
      values: { ...asValues(f.data), ...asValues(f.clinicalData) },
      presences: byPatient.get(f.patientId) ?? [],
    }))

    return { ...range, files, presences }
  }
}

export { IndicatorCohortRepository }
