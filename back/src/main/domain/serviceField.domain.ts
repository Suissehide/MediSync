import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  ServiceFieldChoiceUpdateEntityDomain,
  ServiceFieldCreateEntityDomain,
  ServiceFieldDomainInterface,
  ServiceFieldEntityDomain,
  ServiceFieldUpdateEntityDomain,
} from '../types/domain/serviceField.domain.interface'
import type { ServiceFieldRepositoryInterface } from '../types/infra/orm/repositories/serviceField.repository.interface'
import type { ServiceFieldCategoryRepositoryInterface } from '../types/infra/orm/repositories/serviceFieldCategory.repository.interface'
import {
  choiceKeyFromLabel,
  fieldKeyFromLabel,
  RESERVED_FIELD_KEYS,
  sameIds,
} from '../utils/service-field-types'

class ServiceFieldDomain implements ServiceFieldDomainInterface {
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface
  private readonly serviceFieldCategoryRepository: ServiceFieldCategoryRepositoryInterface

  constructor({
    serviceFieldRepository,
    serviceFieldCategoryRepository,
  }: IocContainer) {
    this.serviceFieldRepository = serviceFieldRepository
    this.serviceFieldCategoryRepository = serviceFieldCategoryRepository
  }

  findAll(): Promise<ServiceFieldEntityDomain[]> {
    return this.serviceFieldRepository.findAll()
  }

  findByID(fieldID: string): Promise<ServiceFieldEntityDomain> {
    return this.serviceFieldRepository.findByID(fieldID)
  }

  async create(
    params: ServiceFieldCreateEntityDomain,
  ): Promise<ServiceFieldEntityDomain> {
    if (
      params.choices !== undefined &&
      params.type !== 'choice' &&
      params.type !== 'multichoice'
    ) {
      throw Boom.badRequest(
        'Seuls les champs à choix (choice, multichoice) acceptent une liste de choix.',
      )
    }
    const categories = await this.serviceFieldCategoryRepository.findAll()
    if (!categories.some((c) => c.id === params.categoryId)) {
      throw Boom.badRequest('Catégorie introuvable pour ce service.')
    }
    const existing = await this.serviceFieldRepository.findAll()
    const key = fieldKeyFromLabel(
      params.label,
      new Set([...existing.map((f) => f.key), ...RESERVED_FIELD_KEYS]),
    )
    const order = existing.filter(
      (f) => f.categoryId === params.categoryId,
    ).length
    const taken = new Set<string>()
    const choices = (params.choices ?? []).map((label, i) => {
      const choiceKey = choiceKeyFromLabel(label, taken)
      taken.add(choiceKey)
      return { key: choiceKey, label, order: i }
    })
    return this.serviceFieldRepository.create({
      key,
      label: params.label,
      type: params.type,
      categoryId: params.categoryId,
      clinical: params.clinical ?? false,
      unit: params.type === 'number' ? (params.unit ?? null) : null,
      order,
      choices,
    })
  }

  async update(
    fieldID: string,
    params: ServiceFieldUpdateEntityDomain,
  ): Promise<ServiceFieldEntityDomain> {
    const base = {
      label: params.label,
      unit: params.unit,
      ...(params.archived !== undefined && {
        archivedAt: params.archived ? new Date() : null,
      }),
    }
    if (params.categoryId === undefined) {
      return this.serviceFieldRepository.update(fieldID, base)
    }
    const [categories, fields] = await Promise.all([
      this.serviceFieldCategoryRepository.findAll(),
      this.serviceFieldRepository.findAll(),
    ])
    const target = categories.find(
      (c) => c.id === params.categoryId && c.archivedAt === null,
    )
    if (!target) {
      throw Boom.badRequest(
        "Catégorie cible introuvable, supprimée ou d'un autre service.",
      )
    }
    const order = fields.filter((f) => f.categoryId === target.id).length
    return this.serviceFieldRepository.update(fieldID, {
      ...base,
      categoryId: target.id,
      order,
    })
  }

  async createChoice(
    fieldID: string,
    label: string,
  ): Promise<ServiceFieldEntityDomain> {
    const field = await this.serviceFieldRepository.findByID(fieldID)
    if (field.type !== 'choice' && field.type !== 'multichoice') {
      throw Boom.badRequest(
        'Seuls les champs à choix (choice, multichoice) acceptent des choix.',
      )
    }
    const taken = new Set(field.choices.map((c) => c.key))
    const key = choiceKeyFromLabel(label, taken)
    return this.serviceFieldRepository.createChoice(fieldID, {
      key,
      label,
      order: field.choices.length,
    })
  }

  updateChoice(
    fieldID: string,
    choiceID: string,
    params: ServiceFieldChoiceUpdateEntityDomain,
  ): Promise<ServiceFieldEntityDomain> {
    return this.serviceFieldRepository.updateChoice(fieldID, choiceID, {
      label: params.label,
      ...(params.archived !== undefined && {
        archivedAt: params.archived ? new Date() : null,
      }),
    })
  }

  async reorderFields(categoryId: string, ids: string[]): Promise<void> {
    const fields = await this.serviceFieldRepository.findAll()
    const categoryIds = fields
      .filter((f) => f.categoryId === categoryId)
      .map((f) => f.id)
    if (!sameIds(categoryIds, ids)) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux champs de cette catégorie.',
      )
    }
    await this.serviceFieldRepository.reorderFields(ids)
  }

  async reorderChoices(fieldID: string, ids: string[]): Promise<void> {
    const field = await this.serviceFieldRepository.findByID(fieldID)
    const choiceIds = field.choices.map((c) => c.id)
    if (!sameIds(choiceIds, ids)) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux choix de ce champ.',
      )
    }
    await this.serviceFieldRepository.reorderChoices(fieldID, ids)
  }
}

export { ServiceFieldDomain }
