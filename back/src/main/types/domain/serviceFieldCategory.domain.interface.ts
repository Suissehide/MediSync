import type { ServiceFieldCategory } from '../../../generated/client'

export type ServiceFieldCategoryEntityDomain = ServiceFieldCategory

export type ServiceFieldCategoryUpdateEntityDomain = {
  label?: string
  archived?: boolean
}

export interface ServiceFieldCategoryDomainInterface {
  findAll: () => Promise<ServiceFieldCategoryEntityDomain[]>
  create: (label: string) => Promise<ServiceFieldCategoryEntityDomain>
  update: (
    categoryID: string,
    params: ServiceFieldCategoryUpdateEntityDomain,
  ) => Promise<ServiceFieldCategoryEntityDomain>
  reorder: (ids: string[]) => Promise<void>
}
