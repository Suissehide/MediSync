import type { IocContainer } from '../types/application/ioc'
import type { SoignantDomainInterface } from '../types/domain/soignant.domain.interface'
import type {
  SoignantCreateEntityDomain,
  SoignantEntityDomain,
  SoignantUpdateEntityDomain,
} from '../types/domain/soignant.domain.interface'
import type { SoignantRepositoryInterface } from '../types/infra/orm/repositories/soignant.repository.interface'
import type { Logger } from '../types/utils/logger'

class SoignantDomain implements SoignantDomainInterface {
  private readonly logger: Logger
  private readonly soignantRepository: SoignantRepositoryInterface

  constructor({ soignantRepository, logger }: IocContainer) {
    this.soignantRepository = soignantRepository
    this.logger = logger
  }

  findAll(): Promise<SoignantEntityDomain[]> {
    return this.soignantRepository.findAll()
  }

  findByID(soignantID: string): Promise<SoignantEntityDomain> {
    return this.soignantRepository.findByID(soignantID)
  }

  create(
    soignantCreateParams: SoignantCreateEntityDomain,
  ): Promise<SoignantEntityDomain> {
    const soignantInputParams = {
      ...soignantCreateParams,
    }
    return this.soignantRepository.create(soignantInputParams)
  }

  update(
    soignantID: string,
    soignantUpdateParams: SoignantUpdateEntityDomain,
  ): Promise<SoignantEntityDomain> {
    return this.soignantRepository.update(soignantID, soignantUpdateParams)
  }

  delete(soignantID: string): Promise<SoignantEntityDomain> {
    return this.soignantRepository.delete(soignantID)
  }
}

export { SoignantDomain }
