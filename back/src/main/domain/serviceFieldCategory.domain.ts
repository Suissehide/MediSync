import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  ServiceFieldCategoryDomainInterface,
  ServiceFieldCategoryEntityDomain,
  ServiceFieldCategoryUpdateEntityDomain,
} from '../types/domain/serviceFieldCategory.domain.interface'
import type { ServiceFieldRepositoryInterface } from '../types/infra/orm/repositories/serviceField.repository.interface'
import type { ServiceFieldCategoryRepositoryInterface } from '../types/infra/orm/repositories/serviceFieldCategory.repository.interface'
import { sameIds } from '../utils/service-field-types'

class ServiceFieldCategoryDomain
  implements ServiceFieldCategoryDomainInterface
{
  private readonly serviceFieldCategoryRepository: ServiceFieldCategoryRepositoryInterface
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface

  constructor({
    serviceFieldCategoryRepository,
    serviceFieldRepository,
  }: IocContainer) {
    this.serviceFieldCategoryRepository = serviceFieldCategoryRepository
    this.serviceFieldRepository = serviceFieldRepository
  }

  async findAll(): Promise<ServiceFieldCategoryEntityDomain[]> {
    await this.serviceFieldCategoryRepository.ensureDefaults()
    return this.serviceFieldCategoryRepository.findAll()
  }

  async create(label: string): Promise<ServiceFieldCategoryEntityDomain> {
    await this.serviceFieldCategoryRepository.ensureDefaults()
    const existing = await this.serviceFieldCategoryRepository.findAll()
    return this.serviceFieldCategoryRepository.create({
      label,
      order: existing.length,
    })
  }

  async update(
    categoryID: string,
    params: ServiceFieldCategoryUpdateEntityDomain,
  ): Promise<ServiceFieldCategoryEntityDomain> {
    if (params.archived === true) {
      const category =
        await this.serviceFieldCategoryRepository.findByID(categoryID)
      if (category.dateField !== null) {
        throw Boom.badRequest(
          'Cette catégorie porte une date fixe et ne peut pas être supprimée.',
        )
      }
      const fields = await this.serviceFieldRepository.findAll()
      const hasActiveField = fields.some(
        (f) => f.categoryId === categoryID && f.archivedAt === null,
      )
      if (hasActiveField) {
        throw Boom.badRequest("Déplacez ou supprimez d'abord ses champs")
      }
    }
    return this.serviceFieldCategoryRepository.update(categoryID, {
      label: params.label,
      ...(params.archived !== undefined && {
        archivedAt: params.archived ? new Date() : null,
      }),
    })
  }

  async reorder(ids: string[]): Promise<void> {
    const categories = await this.serviceFieldCategoryRepository.findAll()
    if (
      !sameIds(
        categories.map((c) => c.id),
        ids,
      )
    ) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux catégories de ce service.',
      )
    }
    await this.serviceFieldCategoryRepository.reorder(ids)
  }
}

export { ServiceFieldCategoryDomain }
