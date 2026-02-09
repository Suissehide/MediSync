import type { IocContainer } from '../../../types/application/ioc'
import type {
  AppointmentCreateEntityRepo,
  AppointmentEntityRepo,
  AppointmentRepositoryInterface,
  AppointmentUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/appointment.repository.interface'
import type {
  AppointmentPatientEntityRepo,
  AppointmentPatientUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/appointmentPatient.repository.interface'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { PostgresPrismaClient } from '../postgres-client'

class AppointmentRepository implements AppointmentRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findAll(): Promise<AppointmentEntityRepo[]> {
    return this.prisma.appointment.findMany({
      include: {
        appointmentPatients: {
          include: {
            patient: true,
          },
        },
      },
    })
  }

  findByID(appointmentID: string): Promise<AppointmentEntityRepo> {
    try {
      return this.prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentID },
        include: {
          appointmentPatients: {
            include: {
              patient: true,
            },
          },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'User',
        error: err,
      })
    }
  }

  async create(
    appointmentCreateParams: AppointmentCreateEntityRepo,
  ): Promise<AppointmentEntityRepo> {
    try {
      const { patientIDs, ...rest } = appointmentCreateParams

      return await this.prisma.appointment.create({
        data: {
          ...rest,
          appointmentPatients: {
            create:
              patientIDs?.map((id) => ({
                patient: { connect: { id } },
              })) || [],
          },
        },
        include: {
          appointmentPatients: {
            include: {
              patient: true,
            },
          },
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        error: err,
      })
    }
  }

  async update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityRepo,
  ): Promise<AppointmentEntityRepo> {
    const { appointmentPatients, ...appointmentData } = appointmentUpdateParams

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Met à jour le rendez-vous principal
        await tx.appointment.update({
          where: { id: appointmentID },
          data: appointmentData,
        })

        // Supprime les patients qui ne sont plus présents
        const incomingIDs = appointmentPatients
          .map((ap) => ap.id)
          .filter((id): id is string => !!id)

        await tx.appointmentPatient.deleteMany({
          where: {
            appointmentId: appointmentID,
            id: { notIn: incomingIDs.length ? incomingIDs : [''] },
          },
        })

        // Upsert chaque patient lié
        for (const ap of appointmentPatients) {
          await tx.appointmentPatient.upsert({
            where: {
              id: ap.id ?? '',
            },
            update: {
              accompanying: ap.accompanying,
              status: ap.status,
              rejectionReason: ap.rejectionReason,
              transmissionNotes: ap.transmissionNotes,
            },
            create: {
              accompanying: ap.accompanying,
              status: ap.status,
              rejectionReason: ap.rejectionReason,
              transmissionNotes: ap.transmissionNotes,
              appointment: { connect: { id: appointmentID } },
              patient: { connect: { id: ap.patientID } },
            },
          })
        }

        // 3️⃣ Retourne le rendez-vous complet avec patients
        return tx.appointment.findUniqueOrThrow({
          where: { id: appointmentID },
          include: {
            appointmentPatients: {
              include: { patient: true },
            },
          },
        })
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        parentEntityName: 'AppointmentPatient',
        error: err,
      })
    }
  }

  async addPatientToAppointment(
    appointmentPatientUpdateParams: AppointmentPatientUpdateEntityRepo,
  ): Promise<AppointmentPatientEntityRepo> {
    try {
      const { appointmentID, patientID } = appointmentPatientUpdateParams
      return await this.prisma.appointmentPatient.create({
        data: {
          appointment: { connect: { id: appointmentID } },
          patient: { connect: { id: patientID } },
          ...appointmentPatientUpdateParams,
        },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'AppointmentPatient',
        error: err,
      })
    }
  }

  async deleteOrphanedByIds(appointmentIDs: string[]): Promise<number> {
    if (appointmentIDs.length === 0) {
      return 0
    }
    const result = await this.prisma.appointment.deleteMany({
      where: {
        id: { in: appointmentIDs },
        appointmentPatients: { none: {} },
      },
    })
    return result.count
  }

  async delete(appointmentID: string): Promise<AppointmentEntityRepo> {
    try {
      return await this.prisma.appointment.delete({
        where: { id: appointmentID },
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        error: err,
      })
    }
  }
}

export { AppointmentRepository }
