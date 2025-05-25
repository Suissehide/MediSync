import { z } from 'zod'

const slotEntity = {
  thematic: z.string(),
  identifier: z.string(),
  soignant: z.string(),
  location: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  description: z.string(),
}

export const slotSchema = z.object({
  ...slotEntity,
})

export const getAppointmentsByIdParamsSchema = z.object({
  slotID: z.string().cuid(),
})

export const slotResponseSchema = z.object({
  ...slotEntity,
  id: z.string(),
})

export type slotInput = z.infer<typeof slotSchema>
