import { z } from 'zod/v4'

import { cuid } from './id.schema'
import { pathwayTemplateSchema } from './index'
import { slotTemplateResponseSchema } from './slotTemplate.schema'

export const pathwayTemplateResponseSchema = pathwayTemplateSchema.extend({
  id: cuid(),
  secondaryTags: z.array(z.string()),
  displayOrder: z.number(),
  slotTemplates: z.array(
    slotTemplateResponseSchema.extend({
      id: cuid(),
    }),
  ),
})

export const pathwayTemplatesResponseSchema = z.array(
  pathwayTemplateResponseSchema,
)

export const getPathwayTemplateByIdParamsSchema = z.object({
  pathwayTemplateID: cuid(),
})

export const createPathwayTemplateSchema = pathwayTemplateSchema
  .pick({
    name: true,
    color: true,
    mainTag: true,
    motifRequired: true,
    firstAppointmentOnly: true,
    prerequisiteIDs: true,
  })
  .extend({
    slotTemplateIDs: z.array(cuid()),
    secondaryTags: z.array(z.string()).default([]),
  })

export const deletePathwayTemplateByIdParamsSchema =
  getPathwayTemplateByIdParamsSchema

export const updatePathwayTemplateByIdSchema = {
  params: getPathwayTemplateByIdParamsSchema,
  body: pathwayTemplateSchema
    .omit({
      slotTemplates: true,
      // pathways: true
    })
    .partial()
    .extend({
      slotTemplateIDs: z.array(cuid()).optional().default([]),
      secondaryTags: z.array(z.string()).optional(),
      prerequisiteIDs: z.array(cuid()).optional(),
      // pathwayIDs: z.array(cuid()).optional().default([]),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be updated',
    }),
}

export type PathwayTemplateInput = z.infer<typeof pathwayTemplateSchema>
export type GetPathwayTemplateByIdParams = z.infer<
  typeof getPathwayTemplateByIdParamsSchema
>
export type CreatePathwayTemplateBody = z.infer<
  typeof createPathwayTemplateSchema
>
export type UpdatePathwayTemplateParams = z.infer<
  typeof updatePathwayTemplateByIdSchema.params
>
export type UpdatePathwayTemplateBody = z.infer<
  typeof updatePathwayTemplateByIdSchema.body
>
export type DeletePathwayTemplateByIdParams = z.infer<
  typeof deletePathwayTemplateByIdParamsSchema
>
export type PathwayTemplateResponse = z.infer<
  typeof pathwayTemplateResponseSchema
>
