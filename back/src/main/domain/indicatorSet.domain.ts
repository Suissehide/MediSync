import Boom from '@hapi/boom'
import * as XLSX from 'xlsx'

import type { IocContainer } from '../types/application/ioc'
import type {
  IndicatorAnswerInput,
  IndicatorEntityDomain,
  IndicatorResult,
  IndicatorSetDomainInterface,
  IndicatorSetEntityDomain,
  IndicatorSetResults,
  IndicatorSetUpdateEntityDomain,
  IndicatorUpdateEntityDomain,
  IndicatorWriteEntityDomain,
} from '../types/domain/indicatorSet.domain.interface'
import type { IndicatorCohortRepositoryInterface } from '../types/infra/orm/repositories/indicatorCohort.repository.interface'
import type {
  IndicatorAnswerEntityRepo,
  IndicatorSetRepositoryInterface,
} from '../types/infra/orm/repositories/indicatorSet.repository.interface'
import type { ServiceRepositoryInterface } from '../types/infra/orm/repositories/service.repository.interface'
import type { ServiceFieldRepositoryInterface } from '../types/infra/orm/repositories/serviceField.repository.interface'
import type { TenantContextInterface } from '../types/utils/tenant-context'
import type { DateRange } from '../utils/indicators/cohort'
import {
  type ComputedResult,
  computeIndicator,
  type IndicatorDefinition,
  validateIndicator,
} from '../utils/indicators/compute'

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

const natureOf = (value: string): Nature => {
  if (!isNature(value)) {
    throw Boom.badImplementation(`Nature inconnue en base : ${value}`)
  }
  return value
}

const definitionOf = (i: IndicatorEntityDomain): IndicatorDefinition => ({
  nature: natureOf(i.nature),
  measure: i.measure,
  options: i.options,
  filters: i.filters,
  breakdownField: i.breakdownField,
  input: i.input,
  note: i.note,
})

const jour = (d: Date): string => d.toISOString().slice(0, 10)

// L'année civile quand la période va exactement du 1er janvier au 31 décembre, sinon null.
const anneeCivile = ({ from, to }: DateRange): number | null => {
  const annee = from.getUTCFullYear()
  return jour(from) === `${annee}-01-01` && jour(to) === `${annee}-12-31`
    ? annee
    : null
}

// Une réponse enregistrée mais vide retombe sur la note de l'indicateur, comme une absence de réponse.
const valeurExcel = (i: IndicatorResult): string | number => {
  if (i.answer === null) {
    return i.value ?? i.note ?? ''
  }
  if (i.input === 'yesno') {
    if (i.answer.boolValue === null) {
      return i.note ?? ''
    }
    return i.answer.boolValue ? 'Oui' : 'Non'
  }
  if (i.answer.numberValue !== null) {
    return i.answer.numberValue
  }
  // Le texte seul va dans le libellé : la valeur reste vide.
  return i.answer.textValue ? '' : (i.note ?? '')
}

// Excel limite un nom de feuille à 31 caractères, sans : \ / ? * [ ].
const nomFeuille = (name: string): string =>
  name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)

class IndicatorSetDomain implements IndicatorSetDomainInterface {
  private readonly indicatorSetRepository: IndicatorSetRepositoryInterface
  private readonly serviceFieldRepository: ServiceFieldRepositoryInterface
  private readonly indicatorCohortRepository: IndicatorCohortRepositoryInterface
  private readonly serviceRepository: ServiceRepositoryInterface
  private readonly tenantContext: TenantContextInterface

  constructor({
    indicatorSetRepository,
    serviceFieldRepository,
    indicatorCohortRepository,
    serviceRepository,
    tenantContext,
  }: IocContainer) {
    this.indicatorSetRepository = indicatorSetRepository
    this.serviceFieldRepository = serviceFieldRepository
    this.indicatorCohortRepository = indicatorCohortRepository
    this.serviceRepository = serviceRepository
    this.tenantContext = tenantContext
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
    const merged = {
      nature: natureOf(params.nature ?? current.nature),
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

  // Indicateurs actifs du jeu, dans l'ordre ; les réponses ne se joignent que sur une année civile.
  async results(setId: string, range: DateRange): Promise<IndicatorSetResults> {
    const manualYear = anneeCivile(range)
    const [set, fields, cohort, answers] = await Promise.all([
      this.indicatorSetRepository.findByID(setId),
      this.serviceFieldRepository.findAll(),
      this.indicatorCohortRepository.findCohort(range),
      manualYear === null
        ? new Map<string, IndicatorAnswerEntityRepo>()
        : this.indicatorSetRepository.findAnswers(setId, manualYear),
    ])
    const actifs = set.indicators.filter((i) => i.archivedAt === null)
    const actifIds = new Set(actifs.map((i) => i.id))
    const indicators = actifs.map((i) => ({
      id: i.id,
      code: i.code,
      group: i.group,
      label: i.label,
      nature: i.nature,
      ...computeIndicator(cohort, definitionOf(i), fields),
      note: i.note,
      input: i.input,
      answer: i.nature === 'manual' ? (answers.get(i.id) ?? null) : null,
      // Parent archivé : absent de la liste, l'enfant se rend sans parent.
      parentId:
        i.parentId !== null && actifIds.has(i.parentId) ? i.parentId : null,
    }))
    return { manualYear, indicators }
  }

  async saveAnswer(
    setId: string,
    year: number,
    indicatorId: string,
    body: IndicatorAnswerInput,
    userId: string,
  ): Promise<IndicatorAnswerEntityRepo> {
    const set = await this.indicatorSetRepository.findByID(setId)
    const indicator = set.indicators.find(
      (i) => i.id === indicatorId && i.archivedAt === null,
    )
    if (!indicator) {
      throw Boom.notFound('Indicateur introuvable')
    }
    if (indicator.nature !== 'manual') {
      throw Boom.badRequest(`L'indicateur ${indicator.code} ne se saisit pas`)
    }
    if ((indicator.input === 'yesno') !== 'boolValue' in body) {
      throw Boom.badRequest(
        `Réponse d'un autre type que celui de ${indicator.code}`,
      )
    }
    const values =
      'boolValue' in body
        ? { numberValue: null, textValue: null, boolValue: body.boolValue }
        : { ...body, boolValue: null }
    return this.indicatorSetRepository.upsertAnswer(
      indicatorId,
      year,
      values,
      userId,
    )
  }

  async preview(
    setId: string,
    indicator: IndicatorDefinition,
    range: DateRange,
  ): Promise<ComputedResult> {
    const [, fields, cohort] = await Promise.all([
      this.indicatorSetRepository.findByID(setId),
      this.serviceFieldRepository.findAll(),
      this.indicatorCohortRepository.findCohort(range),
    ])
    return computeIndicator(cohort, indicator, fields)
  }

  async exportExcel(setId: string, range: DateRange): Promise<Buffer> {
    const [{ indicators }, set, service] = await Promise.all([
      this.results(setId, range),
      this.indicatorSetRepository.findByID(setId),
      this.serviceRepository.findByID(this.tenantContext.scope().serviceId),
    ])
    const rows = [
      { Code: 'Service', Libellé: service.name, Valeur: '' },
      {
        Code: 'Période',
        Libellé: `${jour(range.from)} au ${jour(range.to)}`,
        Valeur: '',
      },
      { Code: '', Libellé: '', Valeur: '' },
      ...indicators.flatMap((i) => [
        {
          Code: i.code,
          Libellé: i.answer?.textValue
            ? `${i.label} — ${i.answer.textValue}`
            : i.label,
          Valeur: valeurExcel(i),
        },
        ...(i.breakdown ?? []).map((b) => ({
          Code: '',
          Libellé: `— ${b.label}`,
          Valeur: b.value,
        })),
      ]),
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 90 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, nomFeuille(set.name))
    const buffer: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    return buffer
  }
}

export { IndicatorSetDomain }
