import { z } from 'zod/v4'

// `GET /super-admin/users?email=` (spec §3.4, §6.2) : « untel ne voit plus ses
// patients » se diagnostique avec des rattachements et des dates, jamais un contenu de dossier.
// Aucune donnée de patient ici — un test le vérifie par recherche de sous-chaîne sur le corps
// brut, en plus des clés exactes.
const establishmentRoleSchema = z.enum(['ADMIN', 'MEMBER'])

export const accountMembershipSchema = z.object({
  establishmentId: z.string(),
  establishmentName: z.string(),
  role: establishmentRoleSchema,
  createdAt: z.coerce.date(),
})

// Nom visible (arbitrage de Léo) : le
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

// `POST /super-admin/users/:userId/access-link` :
// LA SOUPAPE. La garde du jeton refuse à un administrateur d'établissement de réémettre un lien
// pour un compte rattaché ailleurs ou pour un super-admin ; sans ce recours, une personne en
// poste dans deux établissements qui perd son mot de passe n'en aurait aucun (il n'existe ni
// route de mot de passe oublié, ni changement sans l'ancien). Le super-admin est l'autorité qui
// traverse légitimement les établissements : cette route ne porte donc PAS la garde de comptage.
//
// `userId` est reçu du client — c'est licite ICI et nulle part ailleurs : cet appelant dispose
// déjà de `GET /super-admin/users?email=` pour trouver le compte, et son périmètre est la
// plateforme entière. Au niveau établissement, au contraire, l'identité visée est toujours
// déduite d'une appartenance chargée par un repository filtré.
export const superAdminUserParamsSchema = z.object({ userId: z.cuid() })

export const reissueAccessLinkResponseSchema = z.object({
  // Le jeton en clair, rendu une seule fois — voir `accessLink.domain.ts#issue`.
  accessLink: z.object({ token: z.string() }),
})

export type SearchAccountQuery = z.infer<typeof searchAccountQuerySchema>
export type SuperAdminUserParams = z.infer<typeof superAdminUserParamsSchema>
