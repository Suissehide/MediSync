import { z } from 'zod/v4'

const soignantEntity = {
  name: z.string().min(1),
}

export const soignantSchema = z.object({
  ...soignantEntity,
})

export const soignantResponseSchema = z.object({
  id: z.cuid(),
  ...soignantEntity,
})

export const soignantsResponseSchema = z.array(soignantResponseSchema)

export const getSoignantByIdParamsSchema = z.object({
  soignantID: z.cuid(),
})

export const createSoignantSchema = z.object(soignantEntity).pick({
  name: true,
})

export const deleteSoignantByIdParamsSchema = getSoignantByIdParamsSchema

export const updateSoignantByIdSchema = {
  params: getSoignantByIdParamsSchema,
  body: soignantSchema.partial(),
}

export type SoignantInput = z.infer<typeof soignantSchema>
export type GetSoignantByIdParams = z.infer<typeof getSoignantByIdParamsSchema>
export type CreateSoignantBody = z.infer<typeof createSoignantSchema>
export type UpdateSoignantParams = z.infer<
  typeof updateSoignantByIdSchema.params
>
export type UpdateSoignantBody = z.infer<typeof updateSoignantByIdSchema.body>
export type DeleteSoignantByIdParams = z.infer<
  typeof deleteSoignantByIdParamsSchema
>
export type SoignantResponse = z.infer<typeof soignantResponseSchema>
