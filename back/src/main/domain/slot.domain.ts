import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type {
  SlotDomainInterface,
  SlotDTODomain,
  SlotEntityDomain,
} from '../types/domain/slot.domain.interface'
import type { SlotRepositoryInterface } from '../types/infra/orm/repositories/slot.repository.interface'
import type {
  SlotCreateEntityDomain,
  SlotUpdateEntityDomain,
} from '../types/domain/slot.domain.interface'

class SlotDomain implements SlotDomainInterface {
  private readonly logger: Logger
  private readonly slotRepository: SlotRepositoryInterface

  constructor({ slotRepository, logger }: IocContainer) {
    this.slotRepository = slotRepository
    this.logger = logger
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
