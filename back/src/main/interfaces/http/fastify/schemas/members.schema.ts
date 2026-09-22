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
  services: z.array(assignmentSchema).default([]),
})
export const updateMemberSchema = z.object({
  role: establishmentRoleSchema.optional(),
  soignantId: z.cuid().nullable().optional(),
  services: z.array(assignmentSchema).optional(),
})
export const memberParamsSchema = z.object({ membershipId: z.cuid() })

export type MemberResponse = z.infer<typeof memberResponseSchema>
export type AddMemberBody = z.infer<typeof addMemberSchema>
export type UpdateMemberBody = z.infer<typeof updateMemberSchema>
export type MemberParams = z.infer<typeof memberParamsSchema>
