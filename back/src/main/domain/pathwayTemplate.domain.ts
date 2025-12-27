import type { IocContainer } from '../types/application/ioc'
import type {
  PathwayTemplateCreateEntityDomain,
  PathwayTemplateDomainInterface,
  PathwayTemplateEntityDomain,
  PathwayTemplateUpdateEntityDomain,
  PathwayTemplateWithSlotTemplatesDomain,
} from '../types/domain/pathwayTemplate.domain.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { SlotTemplateRepositoryInterface } from '../types/infra/orm/repositories/slotTemplate.repository.interface'

class PathwayTemplateDomain implements PathwayTemplateDomainInterface {
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface
  private readonly slotTemplateRepository: SlotTemplateRepositoryInterface

  constructor({
    pathwayTemplateRepository,
    slotTemplateRepository,
  }: IocContainer) {
    this.pathwayTemplateRepository = pathwayTemplateRepository
    this.slotTemplateRepository = slotTemplateRepository
  }

  findAll(): Promise<PathwayTemplateEntityDomain[]> {
    return this.pathwayTemplateRepository.findAll()
  }

  findByID(
    pathwayTemplateID: string,
  ): Promise<PathwayTemplateWithSlotTemplatesDomain> {
    return this.pathwayTemplateRepository.findByID(pathwayTemplateID)
  }

  create(
    pathwayTemplateCreateParams: PathwayTemplateCreateEntityDomain,
  ): Promise<PathwayTemplateEntityDomain> {
    const pathwayTemplateInputParams = {
      ...pathwayTemplateCreateParams,
    }
    return this.pathwayTemplateRepository.create(pathwayTemplateInputParams)
  }

  async update(
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityDomain,
  ): Promise<PathwayTemplateEntityDomain> {
    const current =
      await this.pathwayTemplateRepository.findByID(pathwayTemplateID)
    if (!current) {
      throw new Error('PathwayTemplate not found')
    }

    const updated = this.pathwayTemplateRepository.update(
      pathwayTemplateID,
      pathwayTemplateUpdateParams,
    )

    if (
      pathwayTemplateUpdateParams.color &&
      pathwayTemplateUpdateParams.color !== current.color &&
      current.slotTemplates.length > 0
    ) {
      await this.slotTemplateRepository.updateMany(
        current.slotTemplates.map((st) => st.id),
        { color: pathwayTemplateUpdateParams.color },
      )
    }

    return updated
  }

  delete(pathwayTemplateID: string): Promise<PathwayTemplateEntityDomain> {
    return this.pathwayTemplateRepository.delete(pathwayTemplateID)
  }
}

export { PathwayTemplateDomain }
