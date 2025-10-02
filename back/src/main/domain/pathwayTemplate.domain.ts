import type { IocContainer } from '../types/application/ioc'
import type {
  PathwayTemplateCreateEntityDomain,
  PathwayTemplateEntityDomain,
  PathwayTemplateUpdateEntityDomain,
  PathwayTemplateWithSlotTemplatesDomain,
} from '../types/domain/pathwayTemplate.domain.interface'
import type { PathwayTemplateDomainInterface } from '../types/domain/pathwayTemplate.domain.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'
import type { Logger } from '../types/utils/logger'

class PathwayTemplateDomain implements PathwayTemplateDomainInterface {
  private readonly logger: Logger
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface

  constructor({ pathwayTemplateRepository, logger }: IocContainer) {
    this.pathwayTemplateRepository = pathwayTemplateRepository
    this.logger = logger
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

  update(
    pathwayTemplateID: string,
    pathwayTemplateUpdateParams: PathwayTemplateUpdateEntityDomain,
  ): Promise<PathwayTemplateEntityDomain> {
    return this.pathwayTemplateRepository.update(
      pathwayTemplateID,
      pathwayTemplateUpdateParams,
    )
  }

  delete(pathwayTemplateID: string): Promise<PathwayTemplateEntityDomain> {
    return this.pathwayTemplateRepository.delete(pathwayTemplateID)
  }
}

export { PathwayTemplateDomain }
