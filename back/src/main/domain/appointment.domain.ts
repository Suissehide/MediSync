import type {
  AppointmentDomainInterface,
  AppointmentEntityDomain,
} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type { AppointmentRepositoryInterface } from '../types/infra/orm/repositories/appointment.repository.interface'

class AppointmentDomain implements AppointmentDomainInterface {
  private readonly logger: Logger
  private readonly appointmentRepository: AppointmentRepositoryInterface

  constructor({ appointmentRepository, logger }: IocContainer) {
    this.appointmentRepository = appointmentRepository
    this.logger = logger
  }

  findByID(appointmentID: string): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.findByID(appointmentID)
  }
}

export { AppointmentDomain }
