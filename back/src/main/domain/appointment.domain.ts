import type { IocContainer } from '../types/application/ioc'
import type {
  AppointmentCreateEntityDomain,
  AppointmentDomainInterface,
  AppointmentEntityDomain,
  AppointmentUpdateEntityDomain,
} from '../types/domain/appointment.domain.interface'
import type { AppointmentRepositoryInterface } from '../types/infra/orm/repositories/appointment.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { AppEventBus } from '../utils/app-event-bus'

class AppointmentDomain implements AppointmentDomainInterface {
  private readonly logger: Logger
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({ appointmentRepository, logger, appEventBus }: IocContainer) {
    this.appointmentRepository = appointmentRepository
    this.logger = logger
    this.appEventBus = appEventBus
  }

  findAll(): Promise<AppointmentEntityDomain[]> {
    return this.appointmentRepository.findAll()
  }

  findByID(appointmentID: string): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.findByID(appointmentID)
  }

  async create(
    appointmentCreateParams: AppointmentCreateEntityDomain,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    const appointment = await this.appointmentRepository.create(appointmentCreateParams)
    this.appEventBus.emit('appointment.created', { userID, appointmentId: appointment.id })
    return appointment
  }

  async update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    const appointment = await this.appointmentRepository.update(
      appointmentID,
      appointmentUpdateParams,
    )
    this.appEventBus.emit('appointment.updated', { userID, appointmentId: appointment.id })
    return appointment
  }

  delete(appointmentID: string): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.delete(appointmentID)
  }
}

export { AppointmentDomain }
