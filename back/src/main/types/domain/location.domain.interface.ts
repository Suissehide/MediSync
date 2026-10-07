import type { Location } from '../../../generated/client'

export type LocationEntityDomain = Location
export type LocationCreateEntityDomain = {
  name: string
}
export type LocationUpdateEntityDomain = {
  name?: string
  // `true` archive, `false` restaure.
  archived?: boolean
}

export interface LocationDomainInterface {
  findAll: (archived?: boolean) => Promise<LocationEntityDomain[]>
  findByID: (locationID: string) => Promise<LocationEntityDomain>
  create: (
    locationCreateParams: LocationCreateEntityDomain,
  ) => Promise<LocationEntityDomain>
  update: (
    locationID: string,
    locationUpdateParams: LocationUpdateEntityDomain,
  ) => Promise<LocationEntityDomain>
}
