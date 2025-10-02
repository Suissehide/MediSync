import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type { PathwayDomainInterface } from '../types/domain/pathway.domain.interface'
import type { PathwayRepositoryInterface } from '../types/infra/orm/repositories/pathway.repository.interface'
import type {
  PathwayCreateEntityDomain,
  PathwayEntityDomain,
  PathwayUpdateEntityDomain,
} from '../types/domain/pathway.domain.interface'

class PathwayDomain implements PathwayDomainInterface {
  private readonly logger: Logger
  private readonly pathwayRepository: PathwayRepositoryInterface

  constructor({ pathwayRepository, logger }: IocContainer) {
    this.pathwayRepository = pathwayRepository
    this.logger = logger
  }

  findAll(): Promise<PathwayEntityDomain[]> {
    return this.pathwayRepository.findAll()
  }

  findByID(pathwayID: string): Promise<PathwayEntityDomain> {
    return this.pathwayRepository.findByID(pathwayID)
  }

  create(
    pathwayCreateParams: PathwayCreateEntityDomain,
  ): Promise<PathwayEntityDomain> {
    const pathwayInputParams = {
      ...pathwayCreateParams,
    }
    return this.pathwayRepository.create(pathwayInputParams)
  }

  update(
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityDomain,
  ): Promise<PathwayEntityDomain> {
    return this.pathwayRepository.update(pathwayID, pathwayUpdateParams)
  }

  delete(pathwayID: string): Promise<PathwayEntityDomain> {
    return this.pathwayRepository.delete(pathwayID)
  }
}

export { PathwayDomain }
