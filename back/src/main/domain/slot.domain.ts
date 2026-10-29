import type { IocContainer } from '../types/application/ioc'
import type {} from '../types/domain/appointment.domain.interface'
import type {
  SlotCreateEntityDomain,
  SlotDateRangeDomain,
  SlotDomainInterface,
  SlotDTODomain,
  SlotEntityDomain,
  SlotUpdateEntityDomain,
} from '../types/domain/slot.domain.interface'
import type { SlotRepositoryInterface } from '../types/infra/orm/repositories/slot.repository.interface'
import {
  detectConflicts,
  type PlanningConflict,
} from '../utils/planning-conflicts'

class SlotDomain implements SlotDomainInterface {
  private readonly slotRepository: SlotRepositoryInterface

  constructor({ slotRepository }: IocContainer) {
    this.slotRepository = slotRepository
  }

  findAll(dateRange?: SlotDateRangeDomain): Promise<SlotDTODomain[]> {
    return this.slotRepository.findAll(dateRange)
  }

  findByID(slotID: string): Promise<SlotDTODomain> {
    return this.slotRepository.findByID(slotID)
  }

  async findConflicts(dateRange: {
    from: Date
    to: Date
  }): Promise<PlanningConflict[]> {
    return detectConflicts(await this.slotRepository.findAll(dateRange))
  }

  // Fenêtre du créneau élargie à ses rendez-vous : déplacer un créneau ne déplace pas ses rendez-vous.
  async conflictsOf(slotID: string): Promise<PlanningConflict[]> {
    const slot = await this.slotRepository.findByID(slotID)
    const intervals = [slot, ...slot.appointments]
    const conflicts = await this.findConflicts({
      from: new Date(Math.min(...intervals.map((i) => i.startDate.getTime()))),
      to: new Date(Math.max(...intervals.map((i) => i.endDate.getTime()))),
    })
    return conflicts.filter((conflict) => conflict.slotIDs.includes(slotID))
  }

  create(slotCreateParams: SlotCreateEntityDomain): Promise<SlotDTODomain> {
    const slotInputParams = {
      ...slotCreateParams,
    }
    return this.slotRepository.create(slotInputParams)
  }

  update(
    slotID: string,
    slotUpdateParams: SlotUpdateEntityDomain,
  ): Promise<SlotDTODomain> {
    return this.slotRepository.update(slotID, slotUpdateParams)
  }

  delete(slotID: string): Promise<SlotEntityDomain> {
    return this.slotRepository.delete(slotID)
  }
}

export { SlotDomain }
