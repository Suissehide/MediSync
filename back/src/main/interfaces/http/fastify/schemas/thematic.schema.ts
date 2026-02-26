import { z } from 'zod/v4'

const thematicEntity = {
  name: z.string().min(1),
}

export const thematicResponseSchema = z.object({
  id: z.cuid(),
  name: z.string(),
  soignants: z.array(z.object({ id: z.cuid(), name: z.string() })),
})

export const thematicsResponseSchema = z.array(thematicResponseSchema)

export const getThematicByIdParamsSchema = z.object({
  thematicID: z.cuid(),
})

export const createThematicSchema = z.object({
  ...thematicEntity,
  soignantIDs: z.array(z.cuid()).default([]),
})

export const updateThematicSchema = z.object({
  name: z.string().min(1).optional(),
  soignantIDs: z.array(z.cuid()).optional(),
})

export const deleteThematicByIdParamsSchema = getThematicByIdParamsSchema

export const updateThematicByIdSchema = {
  params: getThematicByIdParamsSchema,
  body: updateThematicSchema,
}

export type GetThematicByIdParams = z.infer<typeof getThematicByIdParamsSchema>
export type CreateThematicBody = z.infer<typeof createThematicSchema>
export type UpdateThematicParams = z.infer<
  typeof updateThematicByIdSchema.params
>
export type UpdateThematicBody = z.infer<typeof updateThematicByIdSchema.body>
export type DeleteThematicByIdParams = z.infer<
  typeof deleteThematicByIdParamsSchema
>
export type ThematicResponse = z.infer<typeof thematicResponseSchema>
