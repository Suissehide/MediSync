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
import {
  choiceKeyFromLabel,
  fieldKeyFromLabel,
  type ServiceFieldSection,
} from '../utils/service-field-types'

// Vrai si `ids` contient exactement les mêmes éléments que `reference`, sans doublon ni oubli.
const sameIds = (reference: string[], ids: string[]): boolean => {
  const refSet = new Set(reference)
  const idSet = new Set(ids)
  return (
    refSet.size === reference.length &&
    refSet.size === idSet.size &&
    [...refSet].every((id) => idSet.has(id))
  )
}

class ServiceFieldDomain implements ServiceFieldDomainInterface {
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface

  constructor({ serviceFieldRepository }: IocContainer) {
    this.serviceFieldRepository = serviceFieldRepository
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
    const existing = await this.serviceFieldRepository.findAll()
    const key = fieldKeyFromLabel(
      params.label,
      new Set(existing.map((f) => f.key)),
    )
    const order = existing.filter((f) => f.section === params.section).length
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
      section: params.section,
      clinical: params.clinical ?? false,
      unit: params.type === 'number' ? (params.unit ?? null) : null,
      order,
      choices,
    })
  }

  update(
    fieldID: string,
    params: ServiceFieldUpdateEntityDomain,
  ): Promise<ServiceFieldEntityDomain> {
    return this.serviceFieldRepository.update(fieldID, {
      label: params.label,
      unit: params.unit,
      ...(params.archived !== undefined && {
        archivedAt: params.archived ? new Date() : null,
      }),
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

  async reorderFields(
    section: ServiceFieldSection,
    ids: string[],
  ): Promise<void> {
    const fields = await this.serviceFieldRepository.findAll()
    const sectionIds = fields
      .filter((f) => f.section === section)
      .map((f) => f.id)
    if (!sameIds(sectionIds, ids)) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux champs de cette section.',
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
