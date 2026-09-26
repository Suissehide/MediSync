import type { Service } from '../../../../../generated/client'

export type ServiceEntityRepo = Service

export type ServiceCreateEntityRepo = {
  name: string
}

export type ServiceUpdateEntityRepo = {
  name?: string
  deactivatedAt?: Date | null
}

export interface ServiceRepositoryInterface {
  findAll: () => Promise<ServiceEntityRepo[]>
  findByID: (serviceID: string) => Promise<ServiceEntityRepo>
  create: (
    serviceCreateParams: ServiceCreateEntityRepo,
    creatorUserId: string,
  ) => Promise<ServiceEntityRepo>
  update: (
    serviceID: string,
    serviceUpdateParams: ServiceUpdateEntityRepo,
  ) => Promise<ServiceEntityRepo>
}
