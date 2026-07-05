import type { IocContainer } from '../types/application/ioc'
import type {
  LocationCreateEntityDomain,
  LocationDomainInterface,
  LocationEntityDomain,
  LocationUpdateEntityDomain,
} from '../types/domain/location.domain.interface'
import type { LocationRepositoryInterface } from '../types/infra/orm/repositories/location.repository.interface'

class LocationDomain implements LocationDomainInterface {
  private readonly locationRepository: LocationRepositoryInterface

  constructor({ locationRepository }: IocContainer) {
    this.locationRepository = locationRepository
  }

  findAll(): Promise<LocationEntityDomain[]> {
    return this.locationRepository.findAll()
  }

  findByID(locationID: string): Promise<LocationEntityDomain> {
    return this.locationRepository.findByID(locationID)
  }

  create(
    locationCreateParams: LocationCreateEntityDomain,
  ): Promise<LocationEntityDomain> {
    return this.locationRepository.create(locationCreateParams)
  }

  update(
    locationID: string,
    locationUpdateParams: LocationUpdateEntityDomain,
  ): Promise<LocationEntityDomain> {
    return this.locationRepository.update(locationID, locationUpdateParams)
  }

  delete(locationID: string): Promise<LocationEntityDomain> {
    return this.locationRepository.delete(locationID)
  }
}

export { LocationDomain }
