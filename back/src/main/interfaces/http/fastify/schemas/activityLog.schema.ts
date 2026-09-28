import { z } from 'zod/v4'

export const activityLogResponseSchema = z.object({
  id: z.string(),
  userID: z.string(),
  userFirstName: z.string().nullable(),
  userLastName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityID: z.string(),
  createdAt: z.coerce.date(),
})

// Le journal de l'administration couvre tout l'etablissement (navigation par echelle,
// 2026-09-28) : l'ecran a besoin de savoir de quel service vient chaque ligne (nul pour une
// operation d'administration sans service). Extension locale, et non ajout au schema de base :
// celui-ci sert aussi le detail d'etablissement du super-admin, dont les cles sont figees par
// `super-admin-consultation.test.ts`.
const establishmentActivityLogResponseSchema = activityLogResponseSchema.extend({
  serviceId: z.string().nullable(),
})

export const activityLogsResponseSchema = z.object({
  data: z.array(establishmentActivityLogResponseSchema),
  total: z.number(),
  page: z.number(),
})

export const getActivityLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  action: z.string().optional(),
  userID: z.string().optional(),
  from: z.coerce.date().optional(),
  serviceId: z.string().optional(),
})

export const cleanupActivityLogsQuerySchema = z.object({
  serviceId: z.string().optional(),
})

export type CleanupActivityLogsQuery = z.infer<typeof cleanupActivityLogsQuerySchema>

export const cleanupResponseSchema = z.object({
  deleted: z.number(),
})

export type GetActivityLogsQuery = z.infer<typeof getActivityLogsQuerySchema>
