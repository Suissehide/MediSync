import type { Location } from '../../../generated/client'

export type LocationEntityDomain = Location
export type LocationCreateEntityDomain = {
  name: string
}
export type LocationUpdateEntityDomain = {
  name?: string
}

export interface LocationDomainInterface {
  findAll: () => Promise<LocationEntityDomain[]>
  findByID: (locationID: string) => Promise<LocationEntityDomain>
  create: (
    locationCreateParams: LocationCreateEntityDomain,
  ) => Promise<LocationEntityDomain>
  update: (
    locationID: string,
    locationUpdateParams: LocationUpdateEntityDomain,
  ) => Promise<LocationEntityDomain>
  delete: (locationID: string) => Promise<LocationEntityDomain>
}
