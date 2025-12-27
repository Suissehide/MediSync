import type { IocContainer } from '../types/application/ioc'
import type {} from '../types/domain/appointment.domain.interface'
import type {
  SlotCreateEntityDomain,
  SlotDomainInterface,
  SlotDTODomain,
  SlotEntityDomain,
  SlotUpdateEntityDomain,
} from '../types/domain/slot.domain.interface'
import type { SlotRepositoryInterface } from '../types/infra/orm/repositories/slot.repository.interface'

class SlotDomain implements SlotDomainInterface {
  private readonly slotRepository: SlotRepositoryInterface

  constructor({ slotRepository }: IocContainer) {
    this.slotRepository = slotRepository
  }

  findAll(): Promise<SlotDTODomain[]> {
    return this.slotRepository.findAll()
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
