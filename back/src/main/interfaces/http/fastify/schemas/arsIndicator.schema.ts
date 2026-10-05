import { z } from 'zod'

export const arsIndicatorQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((q) => q.from <= q.to, {
    message: 'La date de début doit précéder la date de fin',
  })

export type ArsIndicatorQuery = z.infer<typeof arsIndicatorQuerySchema>

export const arsIndicatorsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  indicators: z.array(
    z.object({
      code: z.string(),
      group: z.string(),
      label: z.string(),
      value: z.number().nullable(),
      note: z.string().nullable(),
    }),
  ),
})
