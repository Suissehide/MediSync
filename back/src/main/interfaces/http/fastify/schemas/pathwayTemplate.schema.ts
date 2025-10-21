import { z } from 'zod/v4'
import { pathwayTemplateSchema } from './index'
import { slotTemplateResponseSchema } from './slotTemplate.schema'

export const pathwayTemplateResponseSchema = pathwayTemplateSchema.extend({
  id: z.cuid(),
  slotTemplates: z.array(
    slotTemplateResponseSchema.extend({
      id: z.cuid(),
    }),
  ),
})

export const pathwayTemplatesResponseSchema = z.array(
  pathwayTemplateResponseSchema,
)

export const getPathwayTemplateByIdParamsSchema = z.object({
  pathwayTemplateID: z.cuid(),
})

export const createPathwayTemplateSchema = pathwayTemplateSchema
  .pick({
    name: true,
    color: true,
  })
  .extend({
    slotTemplateIDs: z.array(z.cuid()),
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
    .safeExtend({
      pathwayIDs: z.array(z.cuid()),
      slotTemplateIDs: z.array(z.cuid()),
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
