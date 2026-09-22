import type { IocContainer } from '../../../types/application/ioc'
import type { PatientWithAppointmentsDomain } from '../../../types/domain/patient.domain.interface'
import type {
  PatientCreateEntityRepo,
  PatientEntityRepo,
  PatientExportFilters,
  PatientPathwayEntityRepo,
  PatientRepositoryInterface,
  PatientUpdateEntityRepo,
  PatientWithTagsEntityRepo,
} from '../../../types/infra/orm/repositories/patient.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { TenantContextInterface } from '../../../types/utils/tenant-context'
import type { PostgresPrismaClient } from '../postgres-client'

type AppointmentPatientWithMainTag = {
  appointment: {
    slot: { pathway: { template: { mainTag: string } | null } | null } | null
  } | null
}

// Tags principaux distincts des parcours auxquels un patient est inscrit.
const distinctMainTags = (
  appointmentPatients: AppointmentPatientWithMainTag[],
): string[] => [
  ...new Set(
    appointmentPatients.flatMap((ap) => {
      const mainTag = ap.appointment?.slot?.pathway?.template?.mainTag
      return mainTag ? [mainTag] : []
    }),
  ),
]

class PatientRepository implements PatientRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface
  private readonly tenantContext: TenantContextInterface

  constructor({ postgresOrm, errorHandler, tenantContext }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
    this.tenantContext = tenantContext
  }

  private get establishmentScope() {
    return this.tenantContext.establishmentScope()
  }

  // Le patient est un modèle d'établissement, mais plusieurs de ses méthodes
  // interrogent des modèles de service (parcours, rendez-vous, priorités) :
  // `scope` fournit le filtre service + établissement pour ces requêtes-là.
  private get scope() {
    return this.tenantContext.scope()
  }

  findAll(): Promise<PatientEntityRepo[]> {
    return this.prisma.patient.findMany({ where: this.establishmentScope })
  }

  async findAllWithTags(): Promise<PatientWithTagsEntityRepo[]> {
    const patients = await this.prisma.patient.findMany({
      where: this.establishmentScope,
      include: {
        appointmentPatients: {
          where: { serviceId: this.scope.serviceId },
          select: {
            appointment: {
              select: {
                slot: {
                  select: {
                    pathway: {
                      select: {
                        template: { select: { mainTag: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        enrollmentIssues: { where: { serviceId: this.scope.serviceId } },
      },
    })

    return patients.map(({ appointmentPatients, ...patient }) => ({
      ...patient,
      pathwayTemplateTags: distinctMainTags(appointmentPatients),
    }))
  }

  async findForExport(filters: PatientExportFilters): Promise<PatientWithTagsEntityRepo[]> {
    const { search, pathwayTemplateTags } = filters

    const patients = await this.prisma.patient.findMany({
      where: {
        ...this.establishmentScope,
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(pathwayTemplateTags?.length
          ? {
              appointmentPatients: {
                some: {
                  serviceId: this.scope.serviceId,
                  appointment: {
                    slot: {
                      pathway: {
                        template: { mainTag: { in: pathwayTemplateTags } },
                      },
                    },
                  },
                },
              },
            }
          : {}),
      },
      include: {
        appointmentPatients: {
          where: { serviceId: this.scope.serviceId },
          select: {
            appointment: {
              select: {
                slot: {
                  select: {
                    pathway: {
                      select: {
                        template: { select: { mainTag: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        enrollmentIssues: { where: { serviceId: this.scope.serviceId } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return patients.map(({ appointmentPatients, ...patient }) => ({
      ...patient,
      pathwayTemplateTags: distinctMainTags(appointmentPatients),
    }))
  }

  async findByID(patientID: string): Promise<PatientWithAppointmentsDomain> {
    try {
      return await this.prisma.patient.findUniqueOrThrow({
        where: { id_establishmentId: { id: patientID, ...this.establishmentScope } },
        include: {
          appointmentPatients: {
            where: { serviceId: this.scope.serviceId },
            include: {
              appointment: true,
            },
          },
          enrollmentIssues: { where: { serviceId: this.scope.serviceId } },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async create(
    patientCreateParams: PatientCreateEntityRepo,
  ): Promise<PatientEntityRepo> {
    try {
      return await this.prisma.patient.create({
        data: { ...patientCreateParams, ...this.establishmentScope },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async update(
    patientID: string,
    patientUpdateParams: PatientUpdateEntityRepo,
  ): Promise<PatientEntityRepo> {
    try {
      return await this.prisma.patient.update({
        where: { id_establishmentId: { id: patientID, ...this.establishmentScope } },
        data: patientUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async delete(patientID: string): Promise<PatientEntityRepo> {
    try {
      return await this.prisma.patient.delete({
        where: { id_establishmentId: { id: patientID, ...this.establishmentScope } },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async getPathwaysForPatient(
    patientID: string,
  ): Promise<PatientPathwayEntityRepo[]> {
    try {
      const pathways = await this.prisma.pathway.findMany({
        where: {
          ...this.scope,
          slots: {
            some: {
              appointments: {
                some: {
                  appointmentPatients: { some: { patientId: patientID } },
                },
              },
            },
          },
        },
        include: {
          template: {
            select: { id: true, name: true, color: true, mainTag: true },
          },
          patientPriorities: {
            where: { patientID, serviceId: this.scope.serviceId },
            select: { priority: true },
          },
        },
      })

      const result: PatientPathwayEntityRepo[] = pathways.map((p) => ({
        pathwayID: p.id,
        templateID: p.template?.id ?? null,
        templateName: p.template?.name ?? null,
        templateColor: p.template?.color ?? null,
        templateMainTag: p.template?.mainTag ?? null,
        startDate: p.startDate,
        priority: p.patientPriorities[0]?.priority ?? null,
      }))

      result.sort((a, b) => {
        const ap = a.priority ?? Number.POSITIVE_INFINITY
        const bp = b.priority ?? Number.POSITIVE_INFINITY
        if (ap !== bp) {
          return ap - bp
        }
        return a.startDate.getTime() - b.startDate.getTime()
      })

      return result
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Pathway',
        error: err,
      })
    }
  }

  async setPathwayPriorities(
    patientID: string,
    orderedPathwayIDs: string[],
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.patientPathwayPriority.deleteMany({ where: { patientID, ...this.scope } })
        if (orderedPathwayIDs.length === 0) {
          return
        }
        await tx.patientPathwayPriority.createMany({
          data: orderedPathwayIDs.map((pathwayID, index) => ({
            patientID,
            pathwayID,
            priority: index,
            ...this.scope,
          })),
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'PatientPathwayPriority',
        error: err,
      })
    }
  }

  async countAppointmentsInPathway(
    patientID: string,
    pathwayID: string,
  ): Promise<number> {
    try {
      const count = await this.prisma.appointmentPatient.count({
        where: {
          ...this.scope,
          patientId: patientID,
          appointment: {
            slot: {
              pathwayID: pathwayID,
            },
          },
        },
      })
      return count
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }

  async removeFromPathway(
    patientID: string,
    pathwayID: string,
  ): Promise<{ deletedAppointments: number; removedFromGroup: number }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const appointmentPatients = await tx.appointmentPatient.findMany({
          where: {
            ...this.scope,
            patientId: patientID,
            appointment: {
              slot: {
                pathwayID: pathwayID,
              },
            },
          },
          include: {
            appointment: {
              include: {
                appointmentPatients: true,
              },
            },
          },
        })

        if (appointmentPatients.length === 0) {
          return { deletedAppointments: 0, removedFromGroup: 0 }
        }

        let deletedAppointments = 0
        let removedFromGroup = 0

        for (const ap of appointmentPatients) {
          const isOnlyPatient = ap.appointment.appointmentPatients.length <= 1

          await tx.appointmentPatient.delete({
            where: { id_serviceId: { id: ap.id, serviceId: this.scope.serviceId } },
          })

          if (isOnlyPatient) {
            await tx.appointment.delete({
              where: { id_serviceId: { id: ap.appointment.id, serviceId: this.scope.serviceId } },
            })
            deletedAppointments++
          } else {
            removedFromGroup++
          }
        }

        return { deletedAppointments, removedFromGroup }
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Patient',
        error: err,
      })
    }
  }
}

export { PatientRepository }
