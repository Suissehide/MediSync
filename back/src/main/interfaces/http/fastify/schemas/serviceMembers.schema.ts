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

export type ServiceMemberParams = z.infer<typeof serviceMemberParamsSchema>
export type SetServiceSoignantBody = z.infer<typeof setServiceSoignantSchema>

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
