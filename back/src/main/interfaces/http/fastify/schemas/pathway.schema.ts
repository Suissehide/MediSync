import { z } from 'zod/v4'
import { pathwaySchema } from './index'

export const pathwayResponseSchema = pathwaySchema.extend({
  id: z.cuid(),
})

export const pathwaysResponseSchema = z.array(pathwayResponseSchema)

export const getPathwayByIdParamsSchema = z.object({
  pathwayID: z.cuid(),
})

export const createPathwaySchema = pathwaySchema
  .pick({
    startDate: true,
  })
  .extend({
    templateID: z.cuid(),
    slotIDs: z.array(z.cuid()),
  })

export const deletePathwayByIdParamsSchema = getPathwayByIdParamsSchema

export const updatePathwayByIdSchema = {
  params: getPathwayByIdParamsSchema,
  body: pathwaySchema
    .omit({ slots: true })
    .partial()
    .extend({
      templateID: z.cuid().optional(),
      slotIDs: z.array(z.cuid()),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be updated',
    }),
}

export const instantiatePathwayBody = z.object({
  pathwayTemplateID: z.cuid(),
  startDate: z.coerce.date(),
})

export type PathwayInput = z.infer<typeof pathwaySchema>
export type GetPathwayByIdParams = z.infer<typeof getPathwayByIdParamsSchema>
export type CreatePathwayBody = z.infer<typeof createPathwaySchema>
export type UpdatePathwayParams = z.infer<typeof updatePathwayByIdSchema.params>
export type UpdatePathwayBody = z.infer<typeof updatePathwayByIdSchema.body>
export type DeletePathwayByIdParams = z.infer<
  typeof deletePathwayByIdParamsSchema
>
export type InstantiatePathwayBody = z.infer<typeof instantiatePathwayBody>
export type PathwayResponse = z.infer<typeof pathwayResponseSchema>
