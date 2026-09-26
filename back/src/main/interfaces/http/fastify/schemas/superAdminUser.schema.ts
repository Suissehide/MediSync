import { z } from 'zod/v4'

// `GET /super-admin/users?email=` (spec §3.4, §6.2, tâche 7) : « untel ne voit plus ses
// patients » se diagnostique avec des rattachements et des dates, jamais un contenu de dossier.
// Aucune donnée de patient ici — un test le vérifie par recherche de sous-chaîne sur le corps
// brut, en plus des clés exactes (task-7-brief.md, Step 3, même double vérification qu'au Step
// 1).
const establishmentRoleSchema = z.enum(['ADMIN', 'MEMBER'])

export const accountMembershipSchema = z.object({
  establishmentId: z.string(),
  establishmentName: z.string(),
  role: establishmentRoleSchema,
  createdAt: z.coerce.date(),
})

// Nom visible (tour de correction 2, arbitrage de Léo qui revient sur le tour précédent) : le
// journal d'activité rend déjà les noms de l'auteur, les cacher ici serait un théâtre — un nom de
// collègue n'est pas une donnée de santé, et le diagnostic de support en a besoin. Voir le
// commentaire sur `FirstAdmin` (establishment.repository.interface.ts).
export const accountSearchResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  deactivatedAt: z.coerce.date().nullable(),
  lastLoginAt: z.coerce.date().nullable(),
  memberships: z.array(accountMembershipSchema),
})

export const searchAccountQuerySchema = z.object({
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
})

export type SearchAccountQuery = z.infer<typeof searchAccountQuerySchema>
