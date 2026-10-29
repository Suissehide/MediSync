import { z } from 'zod/v4'

export const notificationResponseSchema = z.object({
  id: z.string(),
  type: z.enum([
    'MENTION',
    'REMINDER',
    'PATIENT_ADDED',
    'APPOINTMENT_MOVED',
    'APPOINTMENT_CANCELLED',
    'ABSENT',
    'DIAGNOSTIC_DUE',
    'PATHWAY_END',
    'SLOT_ALMOST_FULL',
    'TASK_DUE',
  ]),
  payload: z.record(z.string(), z.unknown()),
  readAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})
export const notificationsResponseSchema = z.array(notificationResponseSchema)
export const notificationParamsSchema = z.object({ notificationId: z.string() })
export type NotificationParams = z.infer<typeof notificationParamsSchema>
