import { z } from 'zod/v4'

export const notificationResponseSchema = z.object({
  id: z.string(),
  type: z.literal('MENTION'),
  payload: z.object({
    taskId: z.string(),
    authorId: z.string().nullable(),
    text: z.string(),
  }),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
export const notificationsResponseSchema = z.array(notificationResponseSchema)
export const notificationParamsSchema = z.object({ notificationId: z.string() })
export type NotificationParams = z.infer<typeof notificationParamsSchema>
