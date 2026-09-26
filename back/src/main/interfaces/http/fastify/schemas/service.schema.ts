import { z } from 'zod/v4'

export const serviceResponseSchema = z.object({
  id: z.cuid(),
  name: z.string(),
  createdAt: z.coerce.date(),
  deactivatedAt: z.coerce.date().nullable(),
})
export const servicesResponseSchema = z.array(serviceResponseSchema)

export const serviceParamsSchema = z.object({ id: z.cuid() })

export const createServiceSchema = z.object({
  name: z.string().min(1),
})

export const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  deactivated: z.boolean().optional(),
})

// Décision 3.6 (spec §3.6) : le second compte est celui qui importe — voir
// `ServiceDeactivationImpactDomain` (types/domain/service.domain.interface.ts).
export const serviceDeactivationImpactResponseSchema = z.object({
  suivisIci: z.number().int().nonnegative(),
  suivisNullePartAilleurs: z.number().int().nonnegative(),
})

export type ServiceResponse = z.infer<typeof serviceResponseSchema>
export type ServiceParams = z.infer<typeof serviceParamsSchema>
export type CreateServiceBody = z.infer<typeof createServiceSchema>
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>
