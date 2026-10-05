import { z } from 'zod/v4'

// Membres d'un service, vus depuis ce service (2026-09-29) : chaque affectation, son role, et le
// soignant (metier du service) que le membre y incarne. Voir `routes/serviceMembers.ts`.
export const serviceMemberResponseSchema = z.object({
  id: z.string(),
  role: z.enum(['COORDINATEUR', 'INTERVENANT', 'SECRETARIAT', 'LECTURE']),
  soignantId: z.string().nullable(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    deactivatedAt: z.coerce.date().nullable(),
  }),
})
export const serviceMembersResponseSchema = z.array(serviceMemberResponseSchema)

export const serviceMemberParamsSchema = z.object({
  serviceMembershipId: z.string().min(1),
})
export const setServiceSoignantSchema = z.object({
  soignantId: z.cuid().nullable(),
})

const serviceRoleSchema = z.enum([
  'COORDINATEUR',
  'INTERVENANT',
  'SECRETARIAT',
  'LECTURE',
])

// Inviter dans le service courant. NI `serviceId` NI role d'etablissement dans le corps : le
// premier vient du tenant resolu, le second est toujours `MEMBER` (voir `inviteToService`).
// `firstName`/`lastName` optionnels, comme `createMemberAccountSchema` : un compte existant
// garde le sien, un compte neuf peut rester sans nom jusqu'a ce que son titulaire le complete.
export const inviteServiceMemberSchema = z.object({
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  role: serviceRoleSchema,
})

export const setServiceRoleSchema = z.object({ role: serviceRoleSchema })

// VOLONTAIREMENT REDUIT A UN SEUL CHAMP, et c'est le point : rendre l'affectation creee
// porterait le nom STOCKE du compte et son cuid, deux oracles d'existence sur une adresse qui a
// deja un compte (meme motif que `createMemberAccountResponseSchema`). Le tableau se rafraichit
// par `GET /membres`, qui coute une lecture journalisee.
export const inviteServiceMemberResponseSchema = z.object({
  accessLink: z.object({ token: z.string() }).nullable(),
})

export type ServiceMemberParams = z.infer<typeof serviceMemberParamsSchema>
export type SetServiceSoignantBody = z.infer<typeof setServiceSoignantSchema>
export type InviteServiceMemberBody = z.infer<typeof inviteServiceMemberSchema>
export type SetServiceRoleBody = z.infer<typeof setServiceRoleSchema>

// Aplatit la ligne du depot : l'identite du compte au premier niveau, jamais rien d'autre de
// l'appartenance d'etablissement.
export const projectServiceMember = (row: {
  id: string
  role: 'COORDINATEUR' | 'INTERVENANT' | 'SECRETARIAT' | 'LECTURE'
  soignantId: string | null
  establishmentMembership: {
    user: {
      id: string
      email: string
      firstName: string | null
      lastName: string | null
      deactivatedAt: Date | null
    }
  }
}) => ({
  id: row.id,
  role: row.role,
  soignantId: row.soignantId,
  user: row.establishmentMembership.user,
})
