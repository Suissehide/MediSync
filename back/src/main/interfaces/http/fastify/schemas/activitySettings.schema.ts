import { z } from 'zod/v4'

export const updateActivitySettingsSchema = z
  .object({
    stopReasonFieldKey: z.string().min(1).nullable(),
    completedChoiceKey: z.string().min(1).nullable(),
  })
  .strict()

export const activitySettingsResponseSchema = updateActivitySettingsSchema

export type UpdateActivitySettingsBody = z.infer<
  typeof updateActivitySettingsSchema
>
