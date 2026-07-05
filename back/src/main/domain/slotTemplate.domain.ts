import type { IocContainer } from '../types/application/ioc'
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
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface

  constructor({ slotTemplateRepository }: IocContainer) {
    this.slotTemplateRepository = slotTemplateRepository
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
