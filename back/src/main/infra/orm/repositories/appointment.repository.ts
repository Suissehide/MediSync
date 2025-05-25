import type { AppointmentRepositoryInterface } from '../../../types/infra/orm/repositories/appointment.repository.interface'
import type { AppointmentEntityDomain } from '../../../types/domain/appointment.domain.interface'
import type { PostgresPrismaClient } from '../postgres-client'
import type { ErrorHandlerInterface } from '../../../types/utils/error-handler'
import type { IocContainer } from '../../../types/application/ioc'

class AppointmentRepository implements AppointmentRepositoryInterface {
  private readonly prisma: PostgresPrismaClient
  private readonly errorHandler: ErrorHandlerInterface

  constructor({ postgresOrm, errorHandler }: IocContainer) {
    this.prisma = postgresOrm.prisma
    this.errorHandler = errorHandler
  }

  findByID(appointmentID: string): Promise<AppointmentEntityDomain> {
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
}

export { AppointmentRepository }
