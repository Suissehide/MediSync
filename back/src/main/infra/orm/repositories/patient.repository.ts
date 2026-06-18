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
import type { PostgresPrismaClient } from '../postgres-client'

class PatientRepository implements PatientRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<PatientEntityRepo[]> {
    return this.prisma.patient.findMany()
  }

  async findAllWithTags(): Promise<PatientWithTagsEntityRepo[]> {
    const patients = await this.prisma.patient.findMany({
      include: {
        appointmentPatients: {
          select: {
            appointment: {
              select: {
                slot: {
                  select: {
                    pathway: {
                      select: {
                        template: { select: { tags: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        enrollmentIssues: true,
      },
    })

    return patients.map(({ appointmentPatients, ...patient }) => ({
      ...patient,
      pathwayTemplateTags: [
        ...new Set(
          appointmentPatients.flatMap(
            (ap) => ap.appointment?.slot?.pathway?.template?.tags ?? [],
          ),
        ),
      ],
    }))
  }

  async findForExport(filters: PatientExportFilters): Promise<PatientWithTagsEntityRepo[]> {
    const { search, pathwayTemplateTags } = filters

    const patients = await this.prisma.patient.findMany({
      where: {
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
                  appointment: {
                    slot: {
                      pathway: {
                        template: { tags: { hasSome: pathwayTemplateTags } },
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
          select: {
            appointment: {
              select: {
                slot: {
                  select: {
                    pathway: {
                      select: {
                        template: { select: { tags: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        enrollmentIssues: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    return patients.map(({ appointmentPatients, ...patient }) => ({
      ...patient,
      pathwayTemplateTags: [
        ...new Set(
          appointmentPatients.flatMap(
            (ap) => ap.appointment?.slot?.pathway?.template?.tags ?? [],
          ),
        ),
      ],
    }))
  }

  async findByID(patientID: string): Promise<PatientWithAppointmentsDomain> {
    try {
      return await this.prisma.patient.findUniqueOrThrow({
        where: { id: patientID },
        include: {
          appointmentPatients: {
            include: {
              appointment: true,
            },
          },
          enrollmentIssues: true,
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
        data: patientCreateParams,
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
        where: { id: patientID },
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
        where: { id: patientID },
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
            select: { id: true, name: true, color: true, tags: true },
          },
          patientPriorities: {
            where: { patientID },
            select: { priority: true },
          },
        },
      })

      const result: PatientPathwayEntityRepo[] = pathways.map((p) => ({
        pathwayID: p.id,
        templateID: p.template?.id ?? null,
        templateName: p.template?.name ?? null,
        templateColor: p.template?.color ?? null,
        templateTags: p.template?.tags ?? [],
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
        await tx.patientPathwayPriority.deleteMany({ where: { patientID } })
        if (orderedPathwayIDs.length === 0) {
          return
        }
        await tx.patientPathwayPriority.createMany({
          data: orderedPathwayIDs.map((pathwayID, index) => ({
            patientID,
            pathwayID,
            priority: index,
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
            where: { id: ap.id },
          })

          if (isOnlyPatient) {
            await tx.appointment.delete({
              where: { id: ap.appointment.id },
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
