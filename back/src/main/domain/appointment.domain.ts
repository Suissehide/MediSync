import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  AppointmentCreateEntityDomain,
  AppointmentDomainInterface,
  AppointmentEntityDomain,
  AppointmentUpdateEntityDomain,
} from '../types/domain/appointment.domain.interface'
import type { SlotDomainInterface } from '../types/domain/slot.domain.interface'
import type { AppointmentRepositoryInterface } from '../types/infra/orm/repositories/appointment.repository.interface'
import type { Logger } from '../types/utils/logger'
import type { AppEventBus } from '../utils/app-event-bus'

class AppointmentDomain implements AppointmentDomainInterface {
  private readonly logger: Logger
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly slotDomain: SlotDomainInterface
  private readonly appEventBus: AppEventBus

  constructor({
    appointmentRepository,
    slotDomain,
    logger,
    appEventBus,
  }: IocContainer) {
    this.appointmentRepository = appointmentRepository
    this.slotDomain = slotDomain
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
    const slot = await this.slotDomain.findByID(appointmentCreateParams.slotID)
    if (slot.locked) {
      throw Boom.conflict(
        'Ce créneau est verrouillé : impossible d\'y ajouter un rendez-vous.',
      )
    }
    const appointment = await this.appointmentRepository.create(appointmentCreateParams)
    this.appEventBus.emit('appointment.created', { userID, appointmentId: appointment.id })
    return appointment
  }

  async update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    if (appointmentUpdateParams.slotID) {
      const slot = await this.slotDomain.findByID(appointmentUpdateParams.slotID)
      if (slot.locked) {
        throw Boom.conflict(
          'Ce créneau est verrouillé : impossible de déplacer un rendez-vous dessus.',
        )
      }
    }
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
