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

export const trackingQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
})

const trackingAppointmentSchema = z.object({
  date: z.coerce.date(),
  status: z.string().nullable(),
})

const trackingPatientSchema = z.object({
  id: z.cuid(),
  firstName: z.string(),
  lastName: z.string(),
  appointments: z.array(trackingAppointmentSchema),
})

const trackingPathwayTemplateSchema = z.object({
  id: z.cuid(),
  name: z.string(),
  color: z.string(),
  tags: z.array(z.string()),
})

export const trackingPathwaySchema = z.object({
  id: z.cuid(),
  startDate: z.coerce.date(),
  template: trackingPathwayTemplateSchema.nullable(),
  patients: z.array(trackingPatientSchema),
})

export const trackingResponseSchema = z.array(trackingPathwaySchema)

export type TrackingQuery = z.infer<typeof trackingQuerySchema>
export type TrackingResponse = z.infer<typeof trackingResponseSchema>
