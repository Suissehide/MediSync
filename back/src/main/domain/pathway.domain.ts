import type { IocContainer } from '../types/application/ioc'
import type {
  PathwayCreateEntityDomain,
  PathwayDomainInterface,
  PathwayEntityDomain,
  PathwayUpdateEntityDomain,
  PathwayWithTemplateAndSlotsDomain,
  RegeneratePathwaysResultDomain,
  TrackingPathwayDomain,
} from '../types/domain/pathway.domain.interface'
import type { PathwayRepositoryInterface } from '../types/infra/orm/repositories/pathway.repository.interface'
import type { PathwayTemplateRepositoryInterface } from '../types/infra/orm/repositories/pathwayTemplate.repository.interface'

class PathwayDomain implements PathwayDomainInterface {
  private readonly pathwayRepository: PathwayRepositoryInterface
  private readonly pathwayTemplateRepository: PathwayTemplateRepositoryInterface

  constructor({ pathwayRepository, pathwayTemplateRepository }: IocContainer) {
    this.pathwayRepository = pathwayRepository
    this.pathwayTemplateRepository = pathwayTemplateRepository
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

  async create(
    pathwayCreateParams: PathwayCreateEntityDomain,
  ): Promise<PathwayEntityDomain> {
    // `templateID` n'a pas de clé composite en base (nullable) : on vérifie
    // que le modèle de parcours appartient au tenant en le chargeant par son
    // repository filtré, qui répond 404 si il appartient à un autre service.
    if (pathwayCreateParams.templateID) {
      await this.pathwayTemplateRepository.findByID(
        pathwayCreateParams.templateID,
      )
    }
    const pathwayInputParams = {
      ...pathwayCreateParams,
    }
    return await this.pathwayRepository.create(pathwayInputParams)
  }

  async update(
    pathwayID: string,
    pathwayUpdateParams: PathwayUpdateEntityDomain,
  ): Promise<PathwayEntityDomain> {
    // Voir create() : même vérification d'appartenance au tenant.
    if (pathwayUpdateParams.templateID) {
      await this.pathwayTemplateRepository.findByID(
        pathwayUpdateParams.templateID,
      )
    }
    return await this.pathwayRepository.update(pathwayID, pathwayUpdateParams)
  }

  delete(pathwayID: string): Promise<PathwayEntityDomain> {
    return this.pathwayRepository.delete(pathwayID)
  }

  regenerate(
    pathwayTemplateID: string,
    fromDate: Date,
  ): Promise<RegeneratePathwaysResultDomain> {
    return this.pathwayRepository.regenerate(pathwayTemplateID, fromDate)
  }
}

export { PathwayDomain }
