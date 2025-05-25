import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type { SlotDomainInterface } from '../types/domain/slot.domain.interface'
import type { SlotRepositoryInterface } from '../types/infra/orm/repositories/slot.repository.interface'

class SlotDomain implements SlotDomainInterface {
  private readonly logger: Logger
  private readonly slotRepository: SlotRepositoryInterface

  constructor({ slotRepository, logger }: IocContainer) {
    this.slotRepository = slotRepository
    this.logger = logger
  }
}

export { SlotDomain }
