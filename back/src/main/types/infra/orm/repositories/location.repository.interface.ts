import type { Location } from '../../../../../generated/client'

export type LocationEntityRepo = Location
export type LocationCreateEntityRepo = {
  name: string
}
export type LocationUpdateEntityRepo = {
  name?: string
  // `true` archive, `false` restaure.
  archived?: boolean
}

export interface LocationRepositoryInterface {
  findAll: (archived?: boolean) => Promise<LocationEntityRepo[]>
  findByID: (locationID: string) => Promise<LocationEntityRepo>
  create: (
    locationCreateParams: LocationCreateEntityRepo,
  ) => Promise<LocationEntityRepo>
  update: (
    locationID: string,
    locationUpdateParams: LocationUpdateEntityRepo,
  ) => Promise<LocationEntityRepo>
}
