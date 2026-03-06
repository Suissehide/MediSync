import { z } from 'zod/v4'

export const activityLogResponseSchema = z.object({
  id: z.string(),
  userID: z.string(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityID: z.string(),
  createdAt: z.coerce.date(),
})

export const activityLogsResponseSchema = z.object({
  data: z.array(activityLogResponseSchema),
  total: z.number(),
  page: z.number(),
})

export const getActivityLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  action: z.string().optional(),
  userID: z.string().optional(),
  from: z.coerce.date().optional(),
})

export const cleanupResponseSchema = z.object({
  deleted: z.number(),
})

export type GetActivityLogsQuery = z.infer<typeof getActivityLogsQuerySchema>
