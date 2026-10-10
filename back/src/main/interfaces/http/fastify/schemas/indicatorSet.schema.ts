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

const periode = { from: z.coerce.date(), to: z.coerce.date() }
const dansLOrdre = (q: { from: Date; to: Date }) => q.from <= q.to
const ordreMessage = {
  message: 'La date de début doit précéder la date de fin',
}

export const rangeQuerySchema = z
  .object(periode)
  .refine(dansLOrdre, ordreMessage)

const answerSchema = z.object({
  numberValue: z.number().nullable(),
  textValue: z.string().nullable(),
  boolValue: z.boolean().nullable(),
})

const breakdownSchema = z
  .array(z.object({ key: z.string(), label: z.string(), value: z.number() }))
  .nullable()

export const resultsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  manualYear: z.number().nullable(),
  indicators: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      group: z.string(),
      label: z.string(),
      nature: natureField,
      value: z.number().nullable(),
      breakdown: breakdownSchema,
      note: z.string().nullable(),
      input: inputField,
      answer: answerSchema.nullable(),
      parentId: z.string().nullable(),
      warnings: z.array(z.string()),
    }),
  ),
})

// Identifiant Prisma exact (cuid de 25 caractères) : `z.cuid()` laisse passer « constructor ».
export const answerParamsSchema = z.object({
  setId: z.cuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  indicatorId: z.string().regex(/^c[a-z0-9]{24}$/),
})

// Le domaine vérifie que la forme reçue est celle de l'indicateur visé.
export const answerBodySchema = z.union([
  z.strictObject({
    numberValue: z.number().int().min(0).nullable(),
    textValue: z.string().max(2000).nullable(),
  }),
  z.strictObject({ boolValue: z.boolean().nullable() }),
])

export const answerResponseSchema = answerSchema

export const previewBodySchema = z
  .object({
    indicator: createIndicatorSchema.pick({
      nature: true,
      measure: true,
      options: true,
      filters: true,
      breakdownField: true,
      input: true,
      note: true,
    }),
    ...periode,
  })
  .strict()
  .refine(dansLOrdre, ordreMessage)

export const previewResponseSchema = z.object({
  value: z.number().nullable(),
  breakdown: breakdownSchema,
  warnings: z.array(z.string()),
})

export type RangeQuery = z.infer<typeof rangeQuerySchema>
export type AnswerParams = z.infer<typeof answerParamsSchema>
export type AnswerBody = z.infer<typeof answerBodySchema>
export type PreviewBody = z.infer<typeof previewBodySchema>
