import { z } from 'zod/v4'

const locationEntity = {
  name: z.string().min(1),
}

export const locationResponseSchema = z.object({
  id: z.cuid(),
  name: z.string(),
})

export const locationsResponseSchema = z.array(locationResponseSchema)

export const getLocationByIdParamsSchema = z.object({
  locationID: z.cuid(),
})

export const createLocationSchema = z.object({
  ...locationEntity,
})

export const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
})

export const deleteLocationByIdParamsSchema = getLocationByIdParamsSchema

export const updateLocationByIdSchema = {
  params: getLocationByIdParamsSchema,
  body: updateLocationSchema,
}

export type GetLocationByIdParams = z.infer<typeof getLocationByIdParamsSchema>
export type CreateLocationBody = z.infer<typeof createLocationSchema>
export type UpdateLocationParams = z.infer<
  typeof updateLocationByIdSchema.params
>
export type UpdateLocationBody = z.infer<typeof updateLocationByIdSchema.body>
export type DeleteLocationByIdParams = z.infer<
  typeof deleteLocationByIdParamsSchema
>
export type LocationResponse = z.infer<typeof locationResponseSchema>
