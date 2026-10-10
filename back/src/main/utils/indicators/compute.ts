import Boom from '@hapi/boom'
import { z } from 'zod'

import type { ServiceFieldChoice } from '../../../generated/client'
import type { ServiceFieldEntityRepo } from '../../types/infra/orm/repositories/serviceField.repository.interface'
import { asFieldType } from '../service-field-types'
import { type CohortFile, finDeJournee, type IndicatorCohort } from './cohort'
import {
  applyFilters,
  type FilterCondition,
  filterConditionSchema,
  OPERATORS_BY_TYPE,
} from './filters'
import { MEASURES, type Measure } from './measures'

export const EMPTY_KEY = '__empty__'

export type IndicatorDefinition = {
  nature: 'computed' | 'manual' | 'unavailable'
  measure: string | null
  options: unknown
  filters: unknown
  breakdownField: string | null
  input: string | null
  note: string | null
}

export type BreakdownRow = { key: string; label: string; value: number }

export type ComputedResult = {
  value: number | null
  breakdown: BreakdownRow[] | null
  warnings: string[]
}

// Le strict nécessaire de `ServiceFieldEntityRepo`, qui s'y assigne tel quel.
export type FieldDefinition = Pick<
  ServiceFieldEntityRepo,
  'key' | 'label' | 'type' | 'archivedAt'
> & {
  choices: Pick<ServiceFieldChoice, 'key' | 'label' | 'order' | 'archivedAt'>[]
}

type Breakdown = {
  field: FieldDefinition
  patients: (c: IndicatorCohort, options: unknown) => CohortFile[]
}

type Parsed = {
  measure: Measure<unknown>
  options: unknown
  filters: FilterCondition[]
  breakdown: Breakdown | null
  warnings: string[]
}

const fieldOf = (
  fields: readonly FieldDefinition[],
  key: string,
): FieldDefinition => {
  const field = fields.find((f) => f.key === key)
  if (!field) {
    throw Boom.badRequest(`Champ inconnu : ${key}`)
  }
  return field
}

const checkChoices = (field: FieldDefinition, keys: string[]): string[] =>
  keys.flatMap((key) => {
    const choice = field.choices.find((c) => c.key === key)
    if (!choice) {
      throw Boom.badRequest(`Choix inconnu pour ${field.label} : ${key}`)
    }
    return choice.archivedAt === null
      ? []
      : [`Filtre sur un choix archivé : ${choice.label}`]
  })

// Rend les avertissements du filtre : champ ou choix archivé reste appliqué.
const checkFilter = (
  cond: FilterCondition,
  fields: readonly FieldDefinition[],
): string[] => {
  const field = fieldOf(fields, cond.field)
  const type = asFieldType(field.type)
  const ops = type ? OPERATORS_BY_TYPE[type] : []
  if (ops.length === 0) {
    throw Boom.badRequest(`Champ non filtrable : ${field.label}`)
  }
  if (!ops.includes(cond.op)) {
    throw Boom.badRequest(
      `Opérateur ${cond.op} non permis pour le champ ${field.label}`,
    )
  }
  if (
    cond.op === 'eq' &&
    typeof cond.value !== (type === 'boolean' ? 'boolean' : 'number')
  ) {
    throw Boom.badRequest(`Valeur invalide pour le filtre sur ${field.label}`)
  }
  return [
    ...(field.archivedAt === null
      ? []
      : [`Filtre sur un champ archivé : ${field.label}`]),
    ...(cond.op === 'in' || cond.op === 'containsAny'
      ? checkChoices(field, cond.value)
      : []),
  ]
}

const parseBreakdown = (
  key: string | null,
  measure: Measure<unknown>,
  fields: readonly FieldDefinition[],
): Breakdown | null => {
  if (key === null) {
    return null
  }
  const field = fieldOf(fields, key)
  if (field.type !== 'choice' && field.type !== 'multichoice') {
    throw Boom.badRequest(
      `Répartition possible sur un champ à choix seulement : ${field.label}`,
    )
  }
  if (measure.unit !== 'patients' || !measure.patients) {
    throw Boom.badRequest(
      `Répartition possible sur une mesure de patients seulement : ${measure.label}`,
    )
  }
  return { field, patients: measure.patients }
}

const parseComputed = (
  def: IndicatorDefinition,
  fields: readonly FieldDefinition[],
): Parsed => {
  if (def.measure === null) {
    throw Boom.badRequest('Mesure manquante')
  }
  const measure = Object.entries(MEASURES).find(
    ([key]) => key === def.measure,
  )?.[1]
  if (!measure) {
    throw Boom.badRequest(`Mesure inconnue : ${def.measure}`)
  }
  const options = measure.options.safeParse(def.options ?? {})
  if (!options.success) {
    throw Boom.badRequest(`Options invalides pour la mesure ${measure.label}`)
  }
  const filters = z.array(filterConditionSchema).safeParse(def.filters ?? [])
  if (!filters.success) {
    throw Boom.badRequest('Filtre invalide')
  }
  const breakdown = parseBreakdown(def.breakdownField, measure, fields)
  const warnings = [
    ...filters.data.flatMap((cond) => checkFilter(cond, fields)),
    ...(breakdown?.field.archivedAt
      ? [`Répartition sur un champ archivé : ${breakdown.field.label}`]
      : []),
  ]
  return {
    measure,
    options: options.data,
    filters: filters.data,
    breakdown,
    warnings: [...new Set(warnings)],
  }
}

// `null` pour un indicateur sans calcul ; lève un 400 sur toute définition invalide.
const parse = (
  def: IndicatorDefinition,
  fields: readonly FieldDefinition[],
): Parsed | null => {
  switch (def.nature) {
    case 'manual':
      if (def.input !== 'number+text' && def.input !== 'yesno') {
        throw Boom.badRequest('Saisie requise : number+text ou yesno')
      }
      return null
    case 'unavailable':
      if (!def.note) {
        throw Boom.badRequest('Note requise pour un indicateur non disponible')
      }
      return null
    case 'computed':
      return parseComputed(def, fields)
  }
}

export const validateIndicator = (
  def: IndicatorDefinition,
  fields: readonly FieldDefinition[],
): void => {
  parse(def, fields)
}

// Une ligne par choix dans l'ordre (archivés s'ils ont un effectif), puis « Non renseigné », qui prend aussi les patients comptés sans dossier.
const breakdownRows = (
  field: FieldDefinition,
  files: CohortFile[],
  total: number,
): BreakdownRow[] => {
  const known = new Set(field.choices.map((c) => c.key))
  const counts = new Map<string, number>()
  for (const f of files) {
    const raw = f.values[field.key]
    const keys = new Set(
      (Array.isArray(raw) ? raw : [raw]).filter(
        (k): k is string => typeof k === 'string' && known.has(k),
      ),
    )
    for (const key of keys.size > 0 ? keys : [EMPTY_KEY]) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [
    ...[...field.choices]
      .sort((a, b) => a.order - b.order)
      .filter((c) => c.archivedAt === null || counts.has(c.key))
      .map((c) => ({
        key: c.key,
        label: c.label,
        value: counts.get(c.key) ?? 0,
      })),
    {
      key: EMPTY_KEY,
      label: 'Non renseigné',
      value: (counts.get(EMPTY_KEY) ?? 0) + total - files.length,
    },
  ]
}

export const computeIndicator = (
  cohort: IndicatorCohort,
  def: IndicatorDefinition,
  fields: readonly FieldDefinition[],
): ComputedResult => {
  const p = parse(def, fields)
  if (p === null) {
    return { value: null, breakdown: null, warnings: [] }
  }
  const c = applyFilters({ ...cohort, to: finDeJournee(cohort.to) }, p.filters)
  const value = p.measure.compute(c, p.options)
  return {
    value,
    breakdown: p.breakdown
      ? breakdownRows(
          p.breakdown.field,
          p.breakdown.patients(c, p.options),
          value,
        )
      : null,
    warnings: p.warnings,
  }
}
