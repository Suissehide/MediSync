import type { ServiceFieldCategory } from '../../../../../generated/client'

export type ServiceFieldCategoryEntityRepo = ServiceFieldCategory

export type ServiceFieldCategoryCreateEntityRepo = {
  label: string
  order: number
}

export type ServiceFieldCategoryUpdateEntityRepo = {
  label?: string
  archivedAt?: Date | null
}

export interface ServiceFieldCategoryRepositoryInterface {
  findAll: () => Promise<ServiceFieldCategoryEntityRepo[]>
  findByID: (categoryID: string) => Promise<ServiceFieldCategoryEntityRepo>
  ensureDefaults: () => Promise<void>
  create: (
    params: ServiceFieldCategoryCreateEntityRepo,
  ) => Promise<ServiceFieldCategoryEntityRepo>
  update: (
    categoryID: string,
    params: ServiceFieldCategoryUpdateEntityRepo,
  ) => Promise<ServiceFieldCategoryEntityRepo>
  reorder: (ids: string[]) => Promise<void>
}
