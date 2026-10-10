import { z } from 'zod'

import type { ServiceFieldType } from '../service-field-types'
import type { IndicatorCohort } from './cohort'

export type FilterCondition =
  | { field: string; op: 'in' | 'containsAny'; value: string[] }
  | { field: string; op: 'eq'; value: boolean | number }
  | { field: string; op: 'lt' | 'lte' | 'gt' | 'gte'; value: number }
  | { field: string; op: 'before' | 'after'; value: string }

const field = z.string().min(1)

export const filterConditionSchema: z.ZodType<FilterCondition> = z.union([
  z.object({
    field,
    op: z.enum(['in', 'containsAny']),
    value: z.array(z.string()).min(1),
  }),
  z.object({
    field,
    op: z.literal('eq'),
    value: z.union([z.boolean(), z.number()]),
  }),
  z.object({
    field,
    op: z.enum(['lt', 'lte', 'gt', 'gte']),
    value: z.number(),
  }),
  z.object({
    field,
    op: z.enum(['before', 'after']),
    value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
])

export const OPERATORS_BY_TYPE: Record<
  ServiceFieldType,
  readonly FilterCondition['op'][]
> = {
  text: [],
  longtext: [],
  choice: ['in'],
  multichoice: ['containsAny'],
  boolean: ['eq'],
  number: ['eq', 'lt', 'lte', 'gt', 'gte'],
  date: ['before', 'after'],
}

// Un patient sans valeur ne satisfait aucune condition ; les dates `YYYY-MM-DD` se comparent en chaînes.
const matches = (value: unknown, cond: FilterCondition): boolean => {
  if (value === undefined || value === null) {
    return false
  }
  switch (cond.op) {
    case 'in':
      return typeof value === 'string' && cond.value.includes(value)
    case 'containsAny':
      return (
        Array.isArray(value) &&
        value.some((v) => cond.value.includes(String(v)))
      )
    case 'eq':
      return value === cond.value
    case 'lt':
      return typeof value === 'number' && value < cond.value
    case 'lte':
      return typeof value === 'number' && value <= cond.value
    case 'gt':
      return typeof value === 'number' && value > cond.value
    case 'gte':
      return typeof value === 'number' && value >= cond.value
    case 'before':
      return typeof value === 'string' && value < cond.value
    case 'after':
      return typeof value === 'string' && value > cond.value
  }
}

// Les filtres restreignent la cohorte aux patients qui les satisfont, dossiers et présences.
export const applyFilters = (
  c: IndicatorCohort,
  filters: FilterCondition[],
): IndicatorCohort => {
  if (filters.length === 0) {
    return c
  }
  const files = c.files.filter((f) =>
    filters.every((cond) => matches(f.values[cond.field], cond)),
  )
  const kept = new Set(files.map((f) => f.patientId))
  return {
    ...c,
    files,
    presences: c.presences.filter((p) => kept.has(p.patientId)),
  }
}
