import { z } from 'zod/v4'

import { passwordSchema } from './password.schema'

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  establishments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.enum(['ADMIN', 'MEMBER']),
      services: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          // Le soignant (metier du service) que ce compte incarne DANS CE SERVICE, s'il y en a
          // un. Porte par l'affectation de service depuis le 2026-09-29.
          soignantId: z.string().nullable(),
          affecte: z.boolean(),
          role: z.enum([
            'COORDINATEUR',
            'INTERVENANT',
            'SECRETARIAT',
            'LECTURE',
          ]),
        }),
      ),
      // Dit à l'écran d'où vient cet accès (voir utils/me-mapper.ts) : sans elle dans ce schéma
      // de réponse, Zod l'aurait silencieusement retirée de la charge envoyée au front.
      origine: z.enum(['reelle', 'octroi']),
    }),
  ),
})

export const updateMeSchema = z
  .object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    currentPassword: z.string().optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine(
    (v) => (v.newPassword === undefined) === (v.currentPassword === undefined),
    {
      message: 'currentPassword and newPassword go together',
    },
  )

export type UpdateMeBody = z.infer<typeof updateMeSchema>
