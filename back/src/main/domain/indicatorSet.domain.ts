import Boom from '@hapi/boom'

import type { IocContainer } from '../types/application/ioc'
import type {
  IndicatorEntityDomain,
  IndicatorSetDomainInterface,
  IndicatorSetEntityDomain,
  IndicatorSetUpdateEntityDomain,
  IndicatorUpdateEntityDomain,
  IndicatorWriteEntityDomain,
} from '../types/domain/indicatorSet.domain.interface'
import type { IndicatorSetRepositoryInterface } from '../types/infra/orm/repositories/indicatorSet.repository.interface'
import type { ServiceFieldRepositoryInterface } from '../types/infra/orm/repositories/serviceField.repository.interface'
import { validateIndicator } from '../utils/indicators/compute'

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

type Sibling = { id: string; code: string; parentId: string | null }

const NATURES = ['computed', 'manual', 'unavailable'] as const
type Nature = (typeof NATURES)[number]

// `Indicator.nature` est une simple colonne texte en base : ce garde-fou la ramène au type
// littéral attendu par `validateIndicator`, comme `isMeasureKey` (utils/indicators/catalog.ts).
const isNature = (value: string): value is Nature =>
  NATURES.some((n) => n === value)

class IndicatorSetDomain implements IndicatorSetDomainInterface {
  private readonly indicatorSetRepository: IndicatorSetRepositoryInterface
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface

  constructor({
    indicatorSetRepository,
    serviceFieldRepository,
  }: IocContainer) {
    this.indicatorSetRepository = indicatorSetRepository
    this.serviceFieldRepository = serviceFieldRepository
  }

  findAll(): Promise<IndicatorSetEntityDomain[]> {
    return this.indicatorSetRepository.findAll()
  }

  findByID(setId: string): Promise<IndicatorSetEntityDomain> {
    return this.indicatorSetRepository.findByID(setId)
  }

  async create(params: { name: string }): Promise<IndicatorSetEntityDomain> {
    const existing = await this.indicatorSetRepository.findAll()
    return this.indicatorSetRepository.create({
      name: params.name,
      order: existing.length,
    })
  }

  update(
    setId: string,
    params: IndicatorSetUpdateEntityDomain,
  ): Promise<IndicatorSetEntityDomain> {
    return this.indicatorSetRepository.update(setId, {
      name: params.name,
      ...(params.archived !== undefined && {
        archivedAt: params.archived ? new Date() : null,
      }),
    })
  }

  async reorder(ids: string[]): Promise<void> {
    const sets = await this.indicatorSetRepository.findAll()
    if (
      !sameIds(
        sets.map((s) => s.id),
        ids,
      )
    ) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux jeux existants.',
      )
    }
    await this.indicatorSetRepository.reorder(ids)
  }

  // Le parent doit être un indicateur du MÊME jeu, distinct de soi-même, et sans créer de cycle.
  private assertParent(
    siblings: readonly Sibling[],
    parentId: string | null,
    selfId: string | null,
  ): string | null {
    if (parentId === null) {
      return null
    }
    if (parentId === selfId) {
      throw Boom.badRequest('Un indicateur ne peut pas être son propre parent.')
    }
    const parentOf = new Map(siblings.map((i) => [i.id, i.parentId]))
    if (!parentOf.has(parentId)) {
      throw Boom.badRequest('Le parent doit appartenir au même jeu.')
    }
    const seen = new Set<string>()
    let ancestorId: string | null = parentId
    while (ancestorId !== null) {
      if (ancestorId === selfId) {
        throw Boom.badRequest('Cycle de parents détecté.')
      }
      if (seen.has(ancestorId)) {
        break
      }
      seen.add(ancestorId)
      ancestorId = parentOf.get(ancestorId) ?? null
    }
    return parentId
  }

  private assertUniqueCode(
    siblings: readonly Sibling[],
    code: string,
    excludeId: string | null,
  ): void {
    if (siblings.some((i) => i.id !== excludeId && i.code === code)) {
      throw Boom.badRequest(`Code déjà utilisé dans ce jeu : ${code}`)
    }
  }

  async createIndicator(
    setId: string,
    params: IndicatorWriteEntityDomain,
  ): Promise<IndicatorEntityDomain> {
    const set = await this.indicatorSetRepository.findByID(setId)
    this.assertUniqueCode(set.indicators, params.code, null)
    const parentId = this.assertParent(set.indicators, params.parentId, null)
    const fields = await this.serviceFieldRepository.findAll()
    validateIndicator(
      {
        nature: params.nature,
        measure: params.measure,
        options: params.options,
        filters: params.filters,
        breakdownField: params.breakdownField,
        input: params.input,
        note: params.note,
      },
      fields,
    )
    return this.indicatorSetRepository.createIndicator(setId, {
      ...params,
      parentId,
      order: set.indicators.length,
    })
  }

  async updateIndicator(
    setId: string,
    indicatorId: string,
    params: IndicatorUpdateEntityDomain,
  ): Promise<IndicatorEntityDomain> {
    const set = await this.indicatorSetRepository.findByID(setId)
    const current = set.indicators.find((i) => i.id === indicatorId)
    if (!current) {
      throw Boom.notFound('Indicateur introuvable')
    }
    if (params.code !== undefined) {
      this.assertUniqueCode(set.indicators, params.code, indicatorId)
    }
    const parentId =
      params.parentId === undefined
        ? current.parentId
        : this.assertParent(set.indicators, params.parentId, indicatorId)
    const nature = params.nature ?? current.nature
    if (!isNature(nature)) {
      throw Boom.badImplementation(`Nature inconnue en base : ${nature}`)
    }
    const merged = {
      nature,
      measure: params.measure === undefined ? current.measure : params.measure,
      options: params.options === undefined ? current.options : params.options,
      filters: params.filters === undefined ? current.filters : params.filters,
      breakdownField:
        params.breakdownField === undefined
          ? current.breakdownField
          : params.breakdownField,
      input: params.input === undefined ? current.input : params.input,
      note: params.note === undefined ? current.note : params.note,
    }
    const fields = await this.serviceFieldRepository.findAll()
    validateIndicator(merged, fields)
    const { archived, ...rest } = params
    return this.indicatorSetRepository.updateIndicator(setId, indicatorId, {
      ...rest,
      parentId,
      ...(archived !== undefined && {
        archivedAt: archived ? new Date() : null,
      }),
    })
  }

  async reorderIndicators(setId: string, ids: string[]): Promise<void> {
    const set = await this.indicatorSetRepository.findByID(setId)
    if (
      !sameIds(
        set.indicators.map((i) => i.id),
        ids,
      )
    ) {
      throw Boom.badRequest(
        'La liste ne correspond pas exactement aux indicateurs de ce jeu.',
      )
    }
    await this.indicatorSetRepository.reorderIndicators(setId, ids)
  }
}

export { IndicatorSetDomain }
