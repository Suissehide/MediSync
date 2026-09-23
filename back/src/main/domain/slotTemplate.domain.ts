import type { IocContainer } from '../types/application/ioc'
import type {
  SlotTemplateDomainInterface,
  SlotTemplateDTODomain,
} from '../types/domain/slotTemplate.domain.interface'
import type { LocationRepositoryInterface } from '../types/infra/orm/repositories/location.repository.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { SlotTemplateRepositoryInterface } from '../types/infra/orm/repositories/slotTemplate.repository.interface'
import type { ThematicRepositoryInterface } from '../types/infra/orm/repositories/thematic.repository.interface'
import type {
  SlotTemplateCreateEntityDomain,
  SlotTemplateUpdateEntityDomain,
} from '../types/domain/slotTemplate.domain.interface'

class SlotTemplateDomain implements SlotTemplateDomainInterface {
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface
  private readonly locationRepository: LocationRepositoryInterface
  private readonly thematicRepository: ThematicRepositoryInterface
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface

  constructor({
    slotTemplateRepository,
    locationRepository,
    thematicRepository,
    pathwayTemplateRepository,
  }: IocContainer) {
    this.slotTemplateRepository = slotTemplateRepository
    this.locationRepository = locationRepository
    this.thematicRepository = thematicRepository
    this.pathwayTemplateRepository = pathwayTemplateRepository
  }

  findAll(): Promise<SlotTemplateDTODomain[]> {
    return this.slotTemplateRepository.findAll()
  }

  findByID(slotTemplateID: string): Promise<SlotTemplateDTODomain> {
    return this.slotTemplateRepository.findByID(slotTemplateID)
  }

  // `template`, `location` et `thematic` n'ont pas de clé composite en base
  // (voir slot-template.include.ts) : on vérifie que la cible appartient au
  // tenant courant en la chargeant par son repository filtré, qui répond 404
  // si elle appartient à un autre service ou établissement.
  private async assertReferences(
    params:
      | Pick<SlotTemplateCreateEntityDomain, 'locationID' | 'thematicId' | 'templateID'>
      | Pick<SlotTemplateUpdateEntityDomain, 'locationID' | 'thematicId' | 'templateID'>,
  ): Promise<void> {
    if (typeof params.locationID === 'string') {
      await this.locationRepository.findByID(params.locationID)
    }
    if (typeof params.thematicId === 'string') {
      await this.thematicRepository.findByID(params.thematicId)
    }
    if (typeof params.templateID === 'string') {
      await this.pathwayTemplateRepository.findByID(params.templateID)
    }
  }

  async create(
    slotTemplateCreateParams: SlotTemplateCreateEntityDomain,
  ): Promise<SlotTemplateDTODomain> {
    await this.assertReferences(slotTemplateCreateParams)
    const slotTemplateInputParams = {
      ...slotTemplateCreateParams,
    }
    return await this.slotTemplateRepository.create(slotTemplateInputParams)
  }

  async update(
    slotTemplateID: string,
    slotTemplateUpdateParams: SlotTemplateUpdateEntityDomain,
  ): Promise<SlotTemplateDTODomain> {
    await this.assertReferences(slotTemplateUpdateParams)
    return await this.slotTemplateRepository.update(
      slotTemplateID,
      slotTemplateUpdateParams,
    )
  }

  delete(slotTemplateID: string): Promise<SlotTemplateDTODomain> {
    return this.slotTemplateRepository.delete(slotTemplateID)
  }
}

export { SlotTemplateDomain }
