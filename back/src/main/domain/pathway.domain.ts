import type {} from '../types/domain/appointment.domain.interface'
import type { IocContainer } from '../types/application/ioc'
import type { Logger } from '../types/utils/logger'
import type { PathwayDomainInterface } from '../types/domain/pathway.domain.interface'
import type { PathwayRepositoryInterface } from '../types/infra/orm/repositories/pathway.repository.interface'

class PathwayDomain implements PathwayDomainInterface {
  private readonly logger: Logger
  private readonly pathwayRepository: PathwayRepositoryInterface

  constructor({ pathwayRepository, logger }: IocContainer) {
    this.pathwayRepository = pathwayRepository
    this.logger = logger
  }
}

export { PathwayDomain }
