import { z } from 'zod/v4'

export const forbiddenWeekResponseSchema = z.object({
  id: z.string(),
  startOfWeek: z.coerce.date(),
  createdAt: z.coerce.date(),
})

export const forbiddenWeeksResponseSchema = z.array(forbiddenWeekResponseSchema)

export const createForbiddenWeekBodySchema = z.object({
  date: z.coerce.date(),
})

export const deleteForbiddenWeekParamsSchema = z.object({
  id: z.string(),
})

export type ForbiddenWeekResponse = z.infer<typeof forbiddenWeekResponseSchema>
export type CreateForbiddenWeekBody = z.infer<typeof createForbiddenWeekBodySchema>
export type DeleteForbiddenWeekParams = z.infer<typeof deleteForbiddenWeekParamsSchema>
