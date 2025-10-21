import { z } from 'zod/v4'
import { slotTemplateSchema } from './index'
import { soignantResponseSchema } from './soignant.schema'

export const slotTemplateResponseSchema = slotTemplateSchema.extend({
  id: z.cuid(),
  soignant: soignantResponseSchema.extend({
    id: z.cuid(),
  }),
})

export const slotTemplatesResponseSchema = z.array(slotTemplateResponseSchema)

export const getSlotTemplateByIdParamsSchema = z.object({
  slotTemplateID: z.cuid(),
})

export const createSlotTemplateSchema = slotTemplateSchema
  .pick({
    startTime: true,
    endTime: true,
    offsetDays: true,

    thematic: true,
    location: true,
    description: true,
    color: true,
    isIndividual: true,
    capacity: true,
  })
  .extend({
    soignantID: z.cuid().optional(),
    templateID: z.cuid().optional(),
  })

export const deleteSlotTemplateByIdParamsSchema =
  getSlotTemplateByIdParamsSchema

export const updateSlotTemplateByIdSchema = {
  params: getSlotTemplateByIdParamsSchema,
  body: slotTemplateSchema.partial().extend({
    soignantID: z.cuid().optional(),
    templateID: z.cuid().optional(),
  }),
}

export type SlotTemplateInput = z.infer<typeof slotTemplateSchema>
export type GetSlotTemplateByIdParams = z.infer<
  typeof getSlotTemplateByIdParamsSchema
>
export type CreateSlotTemplateBody = z.infer<typeof createSlotTemplateSchema>
export type UpdateSlotTemplateParams = z.infer<
  typeof updateSlotTemplateByIdSchema.params
>
export type UpdateSlotTemplateBody = z.infer<
  typeof updateSlotTemplateByIdSchema.body
>
export type DeleteSlotTemplateByIdParams = z.infer<
  typeof deleteSlotTemplateByIdParamsSchema
>
export type SlotTemplateResponse = z.infer<typeof slotTemplateResponseSchema>
