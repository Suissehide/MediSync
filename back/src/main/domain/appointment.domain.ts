import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  AppointmentCreateEntityDomain,
  AppointmentDomainInterface,
  AppointmentEntityDomain,
  AppointmentUpdateEntityDomain,
} from '../types/domain/appointment.domain.interface'
import type { NotificationDispatcherInterface } from '../types/domain/notification-dispatcher.interface'
import type { SlotDomainInterface } from '../types/domain/slot.domain.interface'
import type {
  AppointmentRepositoryInterface,
  AppointmentWithPatientsRepo,
  AppointmentWithSessionRepo,
} from '../types/infra/orm/repositories/appointment.repository.interface'
import type { ThematicRepositoryInterface } from '../types/infra/orm/repositories/thematic.repository.interface'
import type { AppEventBus } from '../utils/app-event-bus'

class AppointmentDomain implements AppointmentDomainInterface {
  private readonly appointmentRepository: AppointmentRepositoryInterface
  private readonly slotDomain: SlotDomainInterface
  private readonly thematicRepository: ThematicRepositoryInterface
  private readonly appEventBus: AppEventBus
  private readonly notificationDispatcher: NotificationDispatcherInterface

  constructor({
    appointmentRepository,
    slotDomain,
    thematicRepository,
    appEventBus,
    notificationDispatcher,
  }: IocContainer) {
    this.appointmentRepository = appointmentRepository
    this.slotDomain = slotDomain
    this.thematicRepository = thematicRepository
    this.appEventBus = appEventBus
    this.notificationDispatcher = notificationDispatcher
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
    // Un créneau archivé est supprimé côté utilisateur : il ne garde que ses
    // rendez-vous existants, il n'en reçoit plus de nouveaux.
    if (slot.archivedAt) {
      throw Boom.conflict(
        "Ce créneau est supprimé : impossible d'y ajouter un rendez-vous.",
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
    if (appointmentCreateParams.patientIDs.length > 0) {
      this.notificationDispatcher.patientsAdded(
        userID,
        appointment.id,
        appointmentCreateParams.patientIDs,
      )
      this.notificationDispatcher.slotFilled(userID, appointment.slotID)
    }
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
      if (slot.archivedAt) {
        throw Boom.conflict(
          'Ce créneau est supprimé : impossible de déplacer un rendez-vous dessus.',
        )
      }
    }
    // Voir create() : même vérification d'appartenance au tenant.
    if (typeof appointmentUpdateParams.thematicId === 'string') {
      await this.thematicRepository.findByID(appointmentUpdateParams.thematicId)
    }
    // Liste vide = suppression : instantané pris avant l'écriture, pas d'événement « updated ».
    const wasDeleted = appointmentUpdateParams.appointmentPatients?.length === 0
    const before = await this.appointmentRepository.findByID(appointmentID)
    const snapshots = wasDeleted
      ? await this.notificationDispatcher.snapshot([appointmentID])
      : []
    const appointment = await this.appointmentRepository.update(
      appointmentID,
      appointmentUpdateParams,
    )
    if (wasDeleted) {
      this.notificationDispatcher.cancelled(userID, snapshots)
    } else {
      this.appEventBus.emit('appointment.updated', {
        userID,
        appointmentId: appointment.id,
      })
      this.#notifyChanges(userID, before, appointment, appointmentUpdateParams)
    }
    return appointment
  }

  // Compare avant/apres (patients ajoutes, absences, horaire) ; dediee pour la complexite de update().
  #notifyChanges(
    userID: string,
    before: AppointmentWithSessionRepo,
    after: AppointmentWithPatientsRepo,
    params: AppointmentUpdateEntityDomain,
  ): void {
    const known = new Set(before.appointmentPatients.map((p) => p.patientId))
    const added = after.appointmentPatients
      .filter((p) => !known.has(p.patientId))
      .map((p) => p.patientId)
    if (added.length > 0) {
      this.notificationDispatcher.patientsAdded(userID, after.id, added)
      this.notificationDispatcher.slotFilled(userID, after.slotID)
    }
    const wasNo = new Set(
      before.appointmentPatients
        .filter((p) => p.status === 'no')
        .map((p) => p.patientId),
    )
    const absent = after.appointmentPatients
      .filter(
        (p) =>
          p.status === 'no' && !p.rejectionReason && !wasNo.has(p.patientId),
      )
      .map((p) => p.patientId)
    if (absent.length > 0) {
      this.notificationDispatcher.absent(userID, after.id, absent)
    }
    if (
      before.startDate.getTime() !== after.startDate.getTime() ||
      (params.slotID && params.slotID !== before.slotID)
    ) {
      this.notificationDispatcher.moved(userID, after.id, {
        startDate: before.startDate,
        locationName: before.slot.slotTemplate.location?.name ?? null,
      })
    }
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

  async delete(
    appointmentID: string,
    userID: string,
  ): Promise<AppointmentEntityDomain> {
    const snapshots = await this.notificationDispatcher.snapshot([
      appointmentID,
    ])
    const deleted = await this.appointmentRepository.delete(appointmentID)
    this.notificationDispatcher.cancelled(userID, snapshots)
    return deleted
  }
}

export { AppointmentDomain }
