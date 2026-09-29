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
  pageSize: z.number(),
})

export const getActivityLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Pagination cote serveur de l'ecran d'administration (2026-09-29) : memes tailles que le
  // selecteur de la table du front, 100 au plus pour borner la requete.
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  userID: z.string().optional(),
  // Recherche par nom, sur le prenom et le nom recopies dans chaque ligne : chaque mot doit
  // apparaitre dans l'un ou l'autre, sans tenir compte de la casse.
  user: z.string().trim().min(1).max(100).optional(),
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
