import type { IocContainer } from '../types/application/ioc'
import type {} from '../types/domain/appointment.domain.interface'
import type { NotificationDispatcherInterface } from '../types/domain/notification-dispatcher.interface'
import type {
  SlotCreateEntityDomain,
  SlotDateRangeDomain,
  SlotDomainInterface,
  SlotDTODomain,
  SlotEntityDomain,
  SlotUpdateEntityDomain,
} from '../types/domain/slot.domain.interface'
import type { SlotRepositoryInterface } from '../types/infra/orm/repositories/slot.repository.interface'

class SlotDomain implements SlotDomainInterface {
  private readonly slotRepository: SlotRepositoryInterface
  private readonly notificationDispatcher: NotificationDispatcherInterface

  constructor({ slotRepository, notificationDispatcher }: IocContainer) {
    this.slotRepository = slotRepository
    this.notificationDispatcher = notificationDispatcher
  }

  findAll(dateRange?: SlotDateRangeDomain): Promise<SlotDTODomain[]> {
    return this.slotRepository.findAll(dateRange)
  }

  findByID(slotID: string): Promise<SlotDTODomain> {
    return this.slotRepository.findByID(slotID)
  }

  create(slotCreateParams: SlotCreateEntityDomain): Promise<SlotDTODomain> {
    const slotInputParams = {
      ...slotCreateParams,
    }
    return this.slotRepository.create(slotInputParams)
  }

  async update(
    slotID: string,
    slotUpdateParams: SlotUpdateEntityDomain,
    userID: string,
  ): Promise<SlotDTODomain> {
    const before = await this.slotRepository.findByID(slotID)
    const archiving = Boolean(slotUpdateParams.archivedAt) && !before.archivedAt
    const snapshots = archiving
      ? await this.notificationDispatcher.snapshot(
          before.appointments.map((a) => a.id),
        )
      : []
    const after = await this.slotRepository.update(slotID, slotUpdateParams)
    if (archiving) {
      this.notificationDispatcher.cancelled(userID, snapshots)
      return after
    }
    const timeChanged = before.startDate.getTime() !== after.startDate.getTime()
    const roomChanged =
      before.slotTemplate.locationID !== after.slotTemplate.locationID
    if (timeChanged || roomChanged) {
      for (const a of after.appointments.filter(
        (x) => x.appointmentPatients.length > 0,
      )) {
        this.notificationDispatcher.moved(
          userID,
          a.id,
          {
            startDate: before.startDate,
            locationName: before.slotTemplate.location?.name ?? null,
          },
          { startDate: after.startDate },
        )
      }
    }
    return after
  }

  async delete(slotID: string, userID: string): Promise<SlotEntityDomain> {
    const before = await this.slotRepository.findByID(slotID)
    const snapshots = await this.notificationDispatcher.snapshot(
      before.appointments.map((a) => a.id),
    )
    const deleted = await this.slotRepository.delete(slotID)
    this.notificationDispatcher.cancelled(userID, snapshots)
    return deleted
  }
}

export { SlotDomain }
