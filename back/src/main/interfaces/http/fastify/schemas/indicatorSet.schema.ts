import { z } from 'zod/v4'

import { filterConditionSchema } from '../../../../utils/indicators/filters'

const codeField = z.string().trim().min(1).max(40)
const labelField = z.string().trim().min(1).max(200)
const groupField = z.string().trim().min(1).max(120)
const natureField = z.enum(['computed', 'manual', 'unavailable'])
const measureField = z.string().min(1).nullable()
const optionsField = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .nullable()
const filtersField = z.array(filterConditionSchema).nullable()
const breakdownFieldField = z.string().min(1).nullable()
const inputField = z.enum(['number+text', 'yesno']).nullable()
const noteField = z.string().trim().max(2000).nullable()
const parentIdField = z.cuid().nullable()

// Tous les champs optionnels par défaut à `null` (jamais `undefined`) : la création pose
// toujours une valeur explicite, que `IndicatorSetDomain` peut comparer sans distinguo.
export const createIndicatorSchema = z
  .object({
    code: codeField,
    label: labelField,
    group: groupField,
    nature: natureField,
    measure: measureField.default(null),
    options: optionsField.default(null),
    filters: filtersField.default(null),
    breakdownField: breakdownFieldField.default(null),
    input: inputField.default(null),
    note: noteField.default(null),
    parentId: parentIdField.default(null),
  })
  .strict()

// Ici au contraire, un champ omis doit laisser la valeur en base inchangée : pas de `.default`,
// `undefined` (absent) et `null` (explicite) restent distincts.
export const updateIndicatorSchema = z
  .object({
    code: codeField.optional(),
    label: labelField.optional(),
    group: groupField.optional(),
    nature: natureField.optional(),
    measure: measureField.optional(),
    options: optionsField.optional(),
    filters: filtersField.optional(),
    breakdownField: breakdownFieldField.optional(),
    input: inputField.optional(),
    note: noteField.optional(),
    parentId: parentIdField.optional(),
    archived: z.boolean().optional(),
  })
  .strict()

const indicatorDtoSchema = z
  .object({
    id: z.cuid(),
    code: z.string(),
    label: z.string(),
    group: z.string(),
    order: z.number(),
    nature: z.string(),
    measure: z.string().nullable(),
    options: z.unknown(),
    filters: z.unknown(),
    breakdownField: z.string().nullable(),
    input: z.string().nullable(),
    note: z.string().nullable(),
    parentId: z.string().nullable(),
    archivedAt: z.date().nullable(),
  })
  .transform(({ archivedAt, ...rest }) => ({
    ...rest,
    archived: archivedAt !== null,
  }))

export const indicatorResponseSchema = indicatorDtoSchema

export const createIndicatorSetSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict()

export const updateIndicatorSetSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .strict()

export const reorderSchema = z.object({ ids: z.array(z.cuid()) }).strict()

export const indicatorSetDtoSchema = z
  .object({
    id: z.cuid(),
    name: z.string(),
    order: z.number(),
    archivedAt: z.date().nullable(),
    indicators: z.array(indicatorDtoSchema),
  })
  .transform(({ archivedAt, ...rest }) => ({
    ...rest,
    archived: archivedAt !== null,
  }))

export const indicatorSetsResponseSchema = z.array(indicatorSetDtoSchema)

export const setIdParamsSchema = z.object({ setId: z.cuid() })
export const indicatorIdParamsSchema = z.object({
  setId: z.cuid(),
  indicatorId: z.cuid(),
})

export type CreateIndicatorBody = z.infer<typeof createIndicatorSchema>
export type UpdateIndicatorBody = z.infer<typeof updateIndicatorSchema>
export type CreateIndicatorSetBody = z.infer<typeof createIndicatorSetSchema>
export type UpdateIndicatorSetBody = z.infer<typeof updateIndicatorSetSchema>
export type ReorderBody = z.infer<typeof reorderSchema>
export type SetIdParams = z.infer<typeof setIdParamsSchema>
export type IndicatorIdParams = z.infer<typeof indicatorIdParamsSchema>

const measureOptionSchema = z.object({
  name: z.string(),
  label: z.string(),
  kind: z.enum(['boolean', 'enum']),
  choices: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
})

export const indicatorCatalogResponseSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    description: z.string(),
    unit: z.string(),
    options: z.array(measureOptionSchema),
  }),
)
