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
import type { ThematicRepositoryInterface } from '../types/infra/orm/repositories/thematic.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'

class AppointmentDomain implements AppointmentDomainInterface {
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly slotDomain: SlotDomainInterface
  private readonly thematicRepository: ThematicRepositoryInterface
  private readonly appEventBus: AppEventBus

  constructor({
    appointmentRepository,
    slotDomain,
    thematicRepository,
    appEventBus,
  }: IocContainer) {
    this.appointmentRepository = appointmentRepository
    this.slotDomain = slotDomain
    this.thematicRepository = thematicRepository
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
        "Ce créneau est verrouillé : impossible d'y ajouter un rendez-vous.",
      )
    }
    // `thematicId` n'a pas de clé composite en base (nullable) : on vérifie
    // que la thématique appartient au tenant en la chargeant par son
    // repository filtré, qui répond 404 si elle appartient à un autre service.
    if (appointmentCreateParams.thematicId) {
      await this.thematicRepository.findByID(appointmentCreateParams.thematicId)
    }
    const appointment = await this.appointmentRepository.create(
      appointmentCreateParams,
    )
    this.appEventBus.emit('appointment.created', {
      userID,
      appointmentId: appointment.id,
    })
    return appointment
  }

  async update(
    appointmentID: string,
    appointmentUpdateParams: AppointmentUpdateEntityDomain,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    if (appointmentUpdateParams.slotID) {
      const slot = await this.slotDomain.findByID(
        appointmentUpdateParams.slotID,
      )
      if (slot.locked) {
        throw Boom.conflict(
          'Ce créneau est verrouillé : impossible de déplacer un rendez-vous dessus.',
        )
      }
    }
    // Voir create() : même vérification d'appartenance au tenant.
    if (typeof appointmentUpdateParams.thematicId === 'string') {
      await this.thematicRepository.findByID(appointmentUpdateParams.thematicId)
    }
    // Une liste de patients vide supprime le rendez-vous : dans ce cas on
    // n'émet pas d'événement « updated » sur une entité qui n'existe plus.
    const wasDeleted = appointmentUpdateParams.appointmentPatients?.length === 0
    const appointment = await this.appointmentRepository.update(
      appointmentID,
      appointmentUpdateParams,
    )
    if (!wasDeleted) {
      this.appEventBus.emit('appointment.updated', {
        userID,
        appointmentId: appointment.id,
      })
    }
    return appointment
  }

  async setConvocationSent(
    appointmentID: string,
    appointmentPatientID: string,
    convocationSent: boolean,
    userID: string,
  ): Promise<void> {
    await this.appointmentRepository.setConvocationSent(
      appointmentID,
      appointmentPatientID,
      convocationSent,
    )
    this.appEventBus.emit('appointment.updated', {
      userID,
      appointmentId: appointmentID,
      detail: convocationSent ? 'convocation envoyée' : 'convocation annulée',
    })
  }

  delete(appointmentID: string): Promise<AppointmentEntityDomain> {
    return this.appointmentRepository.delete(appointmentID)
  }
}

export { AppointmentDomain }
