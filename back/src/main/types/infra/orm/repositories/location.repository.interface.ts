import type { Location } from '../../../../../generated/client'

export type LocationEntityRepo = Location
export type LocationCreateEntityRepo = {
  name: string
}
export type LocationUpdateEntityRepo = {
  name?: string
}

export interface LocationRepositoryInterface {
  findAll: () => Promise<LocationEntityRepo[]>
  findByID: (locationID: string) => Promise<LocationEntityRepo>
  create: (
    locationCreateParams: LocationCreateEntityRepo,
  ) => Promise<LocationEntityRepo>
  update: (
    locationID: string,
    locationUpdateParams: LocationUpdateEntityRepo,
  ) => Promise<LocationEntityRepo>
  delete: (locationID: string) => Promise<LocationEntityRepo>
}
