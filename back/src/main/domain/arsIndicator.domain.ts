import type { IocContainer } from '../types/application/ioc'
import type {
  ArsIndicatorDomainInterface,
  ArsRange,
} from '../types/domain/arsIndicator.domain.interface'
import type { ArsIndicatorRepositoryInterface } from '../types/infra/orm/repositories/arsIndicator.repository.interface'
import {
  type ArsIndicatorResult,
  computeArsIndicators,
} from '../utils/ars-indicators'

class ArsIndicatorDomain implements ArsIndicatorDomainInterface {
  private readonly arsIndicatorRepository: ArsIndicatorRepositoryInterface

  constructor({ arsIndicatorRepository }: IocContainer) {
    this.arsIndicatorRepository = arsIndicatorRepository
  }

  async findAll({ from, to }: ArsRange): Promise<ArsIndicatorResult[]> {
    const files = await this.arsIndicatorRepository.findCohort()
    return computeArsIndicators({ from, to, files })
  }
}

export { ArsIndicatorDomain }
