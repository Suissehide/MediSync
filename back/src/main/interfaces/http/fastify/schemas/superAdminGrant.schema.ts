import { z } from 'zod/v4'

// `POST /super-admin/grants` (spec §3.5, §6.2, tâche 8). Deux exigences, chacune tenue par le
// schéma plutôt que dupliquée dans le domaine :
//   - `reason` : motif obligatoire, une chaîne vide REFUSÉE elle aussi (`.trim().min(1)`, même
//     forme que `createEstablishmentSchema.name`) — « sans cette contrainte, la moitié comptable
//     du mécanisme ne vaut rien » (task-8-brief.md, Step 1).
//   - `durationHours` : optionnel (défaut quatre heures, posé par `SuperAdminGrantDomain.grant`
//     quand il est omis), borné à `]0, 24]` — une demande de quarante-huit heures est REFUSÉE
//     (400), jamais silencieusement ramenée à vingt-quatre (task-8-brief.md, Step 2).
export const createGrantSchema = z.object({
  establishmentId: z.string().trim().min(1, 'Establishment id is required'),
  reason: z.string().trim().min(1, 'A reason is required'),
  durationHours: z
    .number()
    .positive('Duration must be a positive number of hours')
    .max(24, 'Duration cannot exceed 24 hours')
    .optional(),
})
export type CreateGrantBody = z.infer<typeof createGrantSchema>

export const grantResponseSchema = z.object({
  id: z.string(),
  establishmentId: z.string(),
  reason: z.string(),
  grantedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  revokedAt: z.coerce.date().nullable(),
})

export const grantIdParamsSchema = z.object({ id: z.string() })
export type GrantIdParams = z.infer<typeof grantIdParamsSchema>

// `GET /e/:establishmentId/admin/grants` (spec §3.5, §6.2, tâche 8) : les octrois en cours ET
// passés de CET établissement, avec leur motif et leur auteur. Nom visible (`grantedBy`), comme
// partout ailleurs où un administrateur regarde un compte — voir le commentaire sur `FirstAdmin`
// (establishment.repository.interface.ts) : un nom de collègue n'est pas une donnée de santé.
export const establishmentGrantResponseSchema = z.array(
  z.object({
    id: z.string(),
    reason: z.string(),
    grantedAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    revokedAt: z.coerce.date().nullable(),
    grantedBy: z.object({
      id: z.string(),
      email: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
    }),
  }),
)
