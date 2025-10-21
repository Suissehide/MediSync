import type { IocContainer } from '../types/application/ioc'
import type { AppointmentDomainInterface } from '../types/domain/appointment.domain.interface'
import type {
  AppointmentCreateEntityDomain,
  AppointmentEntityDomain,
  AppointmentUpdateEntityDomain,
} from '../types/domain/appointment.domain.interface'
import type { AppointmentRepositoryInterface } from '../types/infra/orm/repositories/appointment.repository.interface'
import type { Logger } from '../types/utils/logger'

class AppointmentDomain implements AppointmentDomainInterface {
  private readonly logger: Logger
  private readonly appointmentRepository: AppointmentRepositoryInterface

  constructor({ appointmentRepository, logger }: IocContainer) {
    this.appointmentRepository = appointmentRepository
    this.logger = logger
  }

  findAll(): Promise<AppointmentEntityDomain[]> {
    return this.appointmentRepository.findAll()
  }

  findByID(appointmentID: string): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.findByID(appointmentID)
  }

  create(
    appointmentCreateParams: AppointmentCreateEntityDomain,
  ): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.create(appointmentCreateParams)
  }

  update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
  ): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.update(
      appointmentID,
      appointmentUpdateParams,
    )
  }

  delete(appointmentID: string): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.delete(appointmentID)
  }
}

export { AppointmentDomain }
