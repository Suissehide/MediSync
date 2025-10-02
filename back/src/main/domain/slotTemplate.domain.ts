import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type {
  SlotTemplateDomainInterface,
  SlotTemplateDTODomain,
} from '../types/domain/slotTemplate.domain.interface'
import type { SlotTemplateRepositoryInterface } from '../types/infra/orm/repositories/slotTemplate.repository.interface'
import type {
  SlotTemplateCreateEntityDomain,
  SlotTemplateUpdateEntityDomain,
} from '../types/domain/slotTemplate.domain.interface'

class SlotTemplateDomain implements SlotTemplateDomainInterface {
  private readonly logger: Logger
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface

  constructor({ slotTemplateRepository, logger }: IocContainer) {
    this.slotTemplateRepository = slotTemplateRepository
    this.logger = logger
  }

  findAll(): Promise<SlotTemplateDTODomain[]> {
    return this.slotTemplateRepository.findAll()
  }

  findByID(slotTemplateID: string): Promise<SlotTemplateDTODomain> {
    return this.slotTemplateRepository.findByID(slotTemplateID)
  }

  create(
    slotTemplateCreateParams: SlotTemplateCreateEntityDomain,
  ): Promise<SlotTemplateDTODomain> {
    const slotTemplateInputParams = {
      ...slotTemplateCreateParams,
    }
    return this.slotTemplateRepository.create(slotTemplateInputParams)
  }

  update(
    slotTemplateID: string,
    slotTemplateUpdateParams: SlotTemplateUpdateEntityDomain,
  ): Promise<SlotTemplateDTODomain> {
    return this.slotTemplateRepository.update(
      slotTemplateID,
      slotTemplateUpdateParams,
    )
  }

  delete(slotTemplateID: string): Promise<SlotTemplateDTODomain> {
    return this.slotTemplateRepository.delete(slotTemplateID)
  }
}

export { SlotTemplateDomain }
