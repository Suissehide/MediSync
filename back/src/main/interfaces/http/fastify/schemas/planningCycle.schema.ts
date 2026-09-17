import { z } from 'zod/v4'

export const planningCycleResponseSchema = z.object({
  startOfWeek: z.coerce.date(),
  weekCount: z.number().int(),
})

// `null` quand aucun cycle n'est configure : le planning reste alors en
// numerotation ISO.
export const planningCycleNullableResponseSchema =
  planningCycleResponseSchema.nullable()

export const savePlanningCycleBodySchema = z.object({
  startOfWeek: z.coerce.date(),
  weekCount: z.number().int().min(1).max(52),
})

export type PlanningCycleResponse = z.infer<typeof planningCycleResponseSchema>
export type SavePlanningCycleBody = z.infer<typeof savePlanningCycleBodySchema>
