import type { IocContainer } from '../types/application/ioc'
import type { ThematicDomainInterface } from '../types/domain/thematic.domain.interface'
import type {
  ThematicCreateEntityDomain,
  ThematicEntityDomain,
  ThematicUpdateEntityDomain,
  ThematicWithSoignantsEntityDomain,
} from '../types/domain/thematic.domain.interface'
import type { ThematicRepositoryInterface } from '../types/infra/orm/repositories/thematic.repository.interface'

class ThematicDomain implements ThematicDomainInterface {
  private readonly thematicRepository: ThematicRepositoryInterface

  constructor({ thematicRepository }: IocContainer) {
    this.thematicRepository = thematicRepository
  }

  findAll(): Promise<ThematicWithSoignantsEntityDomain[]> {
    return this.thematicRepository.findAll()
  }

  findByID(thematicID: string): Promise<ThematicWithSoignantsEntityDomain> {
    return this.thematicRepository.findByID(thematicID)
  }

  create(
    thematicCreateParams: ThematicCreateEntityDomain,
  ): Promise<ThematicWithSoignantsEntityDomain> {
    return this.thematicRepository.create(thematicCreateParams)
  }

  update(
    thematicID: string,
    thematicUpdateParams: ThematicUpdateEntityDomain,
  ): Promise<ThematicWithSoignantsEntityDomain> {
    return this.thematicRepository.update(thematicID, thematicUpdateParams)
  }

  delete(thematicID: string): Promise<ThematicEntityDomain> {
    return this.thematicRepository.delete(thematicID)
  }
}

export { ThematicDomain }
