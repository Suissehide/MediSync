import { z } from 'zod'

export const dateRangeQueryObject = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
})

export const arsIndicatorQuerySchema = dateRangeQueryObject.refine(
  (q) => q.from <= q.to,
  { message: 'La date de début doit précéder la date de fin' },
)

export type ArsIndicatorQuery = z.infer<typeof arsIndicatorQuerySchema>

const answerSchema = z.object({
  numberValue: z.number().nullable(),
  textValue: z.string().nullable(),
  boolValue: z.boolean().nullable(),
})

export const arsIndicatorsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  manualYear: z.number().nullable(),
  indicators: z.array(
    z.object({
      code: z.string(),
      group: z.string(),
      label: z.string(),
      value: z.number().nullable(),
      note: z.string().nullable(),
      kind: z.enum(['computed', 'unavailable', 'manual']),
      input: z.enum(['number+text', 'yesno']).nullable(),
      answer: answerSchema.nullable(),
    }),
  ),
})

export const arsAnswerParamsSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  code: z.string(),
})

export type ArsAnswerParams = z.infer<typeof arsAnswerParamsSchema>

// Le domaine vérifie que la forme reçue est celle de l'indicateur visé.
export const arsAnswerBodySchema = z.union([
  z.strictObject({
    numberValue: z.number().int().min(0).nullable(),
    textValue: z.string().max(2000).nullable(),
  }),
  z.strictObject({ boolValue: z.boolean().nullable() }),
])

export type ArsAnswerBody = z.infer<typeof arsAnswerBodySchema>

export const arsAnswerResponseSchema = answerSchema
