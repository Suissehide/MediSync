import type { IocContainer } from '../types/application/ioc'
import type {
  PathwayCreateEntityDomain,
  PathwayDomainInterface,
  PathwayEntityDomain,
  PathwayUpdateEntityDomain,
  PathwayWithTemplateAndSlotsDomain,
  TrackingPathwayDomain,
} from '../types/domain/pathway.domain.interface'
import type { PathwayRepositoryInterface } from '../types/infra/orm/repositories/pathway.repository.interface'

class PathwayDomain implements PathwayDomainInterface {
  private readonly pathwayRepository: PathwayRepositoryInterface

  constructor({ pathwayRepository }: IocContainer) {
    this.pathwayRepository = pathwayRepository
  }

  findAll(): Promise<PathwayWithTemplateAndSlotsDomain[]> {
    return this.pathwayRepository.findAll()
  }

  findByID(pathwayID: string): Promise<PathwayEntityDomain> {
    return this.pathwayRepository.findByID(pathwayID)
  }

  findTracking(year: number, month: number): Promise<TrackingPathwayDomain[]> {
    return this.pathwayRepository.findTracking(year, month)
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
