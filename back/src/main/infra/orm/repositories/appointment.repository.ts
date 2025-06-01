import type { IocContainer } from '../../../types/application/ioc'
import type { AppointmentRepositoryInterface } from '../../../types/infra/orm/repositories/appointment.repository.interface'
import type {
  AppointmentCreateEntityRepo,
  AppointmentEntityRepo,
  AppointmentUpdateEntityRepo,
} from '../../../types/infra/orm/repositories/appointment.repository.interface'
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
    return this.prisma.appointment.findMany()
  }

  findByID(appointmentID: string): Promise<AppointmentEntityRepo> {
    try {
      return this.prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentID },
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
      return await this.prisma.appointment.create({
        data: appointmentCreateParams,
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
    try {
      return await this.prisma.appointment.update({
        where: { id: appointmentID },
        data: appointmentUpdateParams,
      })
    } catch (err) {
      throw this.errorHandler.boomErrorFromPrismaError({
        entityName: 'Appointment',
        error: err,
      })
    }
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
