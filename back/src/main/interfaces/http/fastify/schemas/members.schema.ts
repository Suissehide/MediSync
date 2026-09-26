import { z } from 'zod/v4'

const serviceRoleSchema = z.enum([
  'COORDINATEUR',
  'INTERVENANT',
  'SECRETARIAT',
  'LECTURE',
])
const establishmentRoleSchema = z.enum(['ADMIN', 'MEMBER'])
const assignmentSchema = z.object({
  serviceId: z.cuid(),
  role: serviceRoleSchema,
})

// Un membre n'a qu'un rôle par service : deux affectations au même service
// sont une erreur de la requête, pas un conflit de base de données.
const assignmentsSchema = z
  .array(assignmentSchema)
  .refine(
    (assignments) =>
      new Set(assignments.map((a) => a.serviceId)).size === assignments.length,
    { message: 'Un service ne peut apparaitre qu une fois' },
  )

export const memberResponseSchema = z.object({
  id: z.string(),
  role: establishmentRoleSchema,
  soignantId: z.string().nullable(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    deactivatedAt: z.coerce.date().nullable(),
  }),
  serviceMemberships: z.array(
    z.object({ serviceId: z.string(), role: serviceRoleSchema }),
  ),
})
export const membersResponseSchema = z.array(memberResponseSchema)

// L'identité est rattachée par e-mail : le client ne désigne jamais une
// appartenance ni un utilisateur par identifiant technique.
export const addMemberSchema = z.object({
  email: z.email(),
  role: establishmentRoleSchema,
  soignantId: z.cuid().nullable().default(null),
  services: assignmentsSchema.default([]),
})
export const updateMemberSchema = z.object({
  role: establishmentRoleSchema.optional(),
  soignantId: z.cuid().nullable().optional(),
  services: assignmentsSchema.optional(),
})
export const memberParamsSchema = z.object({ membershipId: z.cuid() })

// `POST /e/:establishmentId/admin/members/account` (tâche 10, step 1) : créer un compte de
// membre, et rendre son lien de première connexion. Le brief écrit ce chemin sans `/admin` ;
// `membersRouter` est monté sous `/admin` (establishment-admin.routes.ts), et une route portant
// `:establishmentId` enregistrée hors de ces greffons fait échouer le démarrage
// (`assertTenantShapedRoute`). Le chemin réel est donc celui ci-dessus.
//
// `firstName`/`lastName` optionnels, comme `createEstablishmentSchema` : un compte déjà existant
// garde le sien (il n'est JAMAIS écrasé), un compte neuf peut rester sans nom jusqu'à ce que son
// titulaire complète son profil (`/me`).
export const createMemberAccountSchema = z.object({
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  role: establishmentRoleSchema,
  soignantId: z.cuid().nullable().default(null),
  services: assignmentsSchema.default([]),
})

// Le jeton en clair, rendu une seule fois — voir `accessLink.domain.ts#issue`. Jamais journalisé,
// jamais recopié dans une URL (spec §6.1).
const accessLinkSchema = z.object({ token: z.string() })

// VOLONTAIREMENT PLUS PAUVRE que `memberResponseSchema` : le bloc `user` en est absent.
// Même leçon qu'à la tâche 6 (`createEstablishmentResponseSchema`) : sur une adresse qui a DÉJÀ
// un compte, `user.firstName`/`user.lastName` rendraient la valeur STOCKÉE, pas celle SOUMISE, et
// `user.id` est un cuid — qui encode l'instant de création du compte. Trois oracles d'existence,
// dans des VALEURS plutôt que dans la forme. Ne subsistent ici que des colonnes que l'appelant
// vient lui-même d'écrire : l'appartenance est neuve dans les DEUX cas.
//
// CE QUE CELA NE FERME PAS, et que le rapport de tâche nomme : un `GET /members` fait juste
// après montre l'identité stockée du compte rattaché. C'est inhérent à la route (rattacher une
// adresse à son établissement, c'est en voir le titulaire) et cela coûte une écriture
// journalisée (`member.accountCreated`), là où le canal temporel, lui, ne laissait aucune trace.
export const createMemberAccountResponseSchema = z.object({
  member: z.object({
    id: z.string(),
    role: establishmentRoleSchema,
    soignantId: z.string().nullable(),
    serviceMemberships: z.array(
      z.object({ serviceId: z.string(), role: serviceRoleSchema }),
    ),
  }),
  accessLink: accessLinkSchema,
})

// `POST /e/:establishmentId/admin/members/:membershipId/access-link` (tâche 10, step 3) :
// réémettre un lien pour un membre existant — la réinitialisation d'un accès oublié.
export const memberAccessLinkResponseSchema = z.object({
  accessLink: accessLinkSchema,
})

export type MemberResponse = z.infer<typeof memberResponseSchema>
export type AddMemberBody = z.infer<typeof addMemberSchema>
export type UpdateMemberBody = z.infer<typeof updateMemberSchema>
export type MemberParams = z.infer<typeof memberParamsSchema>
export type CreateMemberAccountBody = z.infer<typeof createMemberAccountSchema>
