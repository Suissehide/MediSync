import { z } from 'zod/v4'

import { appointmentResponseSchema } from './appointment.schema'
import { slotSchema } from './index'
import { pathwayResponseSchema } from './pathway.schema'
import {
  createSlotTemplateSchema,
  slotTemplateResponseSchema,
  updateSlotTemplateByIdSchema,
} from './slotTemplate.schema'

export const slotResponseSchema = slotSchema.extend({
  id: z.cuid(),
  slotTemplate: slotTemplateResponseSchema.extend({
    id: z.cuid(),
  }),
  pathway: pathwayResponseSchema
    .extend({
      id: z.cuid(),
    })
    .optional()
    .nullable(),
  appointments: z.array(
    appointmentResponseSchema.extend({
      id: z.cuid(),
    }),
  ),
})

export const slotsResponseSchema = z.array(slotResponseSchema)

export const getSlotByIdParamsSchema = z.object({
  slotID: z.cuid(),
})

/**
 * Fenêtre temporelle optionnelle : sans elle, tous les créneaux sont renvoyés.
 * Un créneau est retenu dès qu'il chevauche la fenêtre, même partiellement.
 */
export const getSlotsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

export const createSlotSchemaBase = slotSchema
  .pick({
    startDate: true,
    endDate: true,
  })
  .extend({
    soignantIDs: z.array(z.cuid()).optional(),
  })

const withTemplateID = createSlotSchemaBase.extend({
  slotTemplateID: z.cuid(),
})

const withTemplateData = createSlotSchemaBase.extend({
  slotTemplate: createSlotTemplateSchema,
})

export const createSlotWithTemplateSchema = z.union([
  withTemplateID,
  withTemplateData,
])

export const deleteSlotByIdParamsSchema = getSlotByIdParamsSchema

export const updateSlotByIdSchema = {
  params: getSlotByIdParamsSchema,
  body: slotSchema.partial().extend({
    soignantIDs: z.array(z.cuid()).optional(),
    slotTemplate: updateSlotTemplateByIdSchema.body
      .extend({
        id: z.cuid(),
      })
      .optional(),
  }),
}

export type SlotInput = z.infer<typeof slotSchema>
export type GetSlotByIdParams = z.infer<typeof getSlotByIdParamsSchema>
export type GetSlotsQuery = z.infer<typeof getSlotsQuerySchema>
export type CreateSlotBody = z.infer<typeof createSlotWithTemplateSchema>
export type UpdateSlotParams = z.infer<typeof updateSlotByIdSchema.params>
export type UpdateSlotBody = z.infer<typeof updateSlotByIdSchema.body>
export type DeleteSlotByIdParams = z.infer<typeof deleteSlotByIdParamsSchema>
export type SlotResponse = z.infer<typeof slotResponseSchema>
