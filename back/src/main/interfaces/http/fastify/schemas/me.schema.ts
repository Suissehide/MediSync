import { z } from 'zod/v4'

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
      soignantId: z.string().nullable(),
      services: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          role: z.enum([
            'COORDINATEUR',
            'INTERVENANT',
            'SECRETARIAT',
            'LECTURE',
          ]),
        }),
      ),
    }),
  ),
})

export const updateMeSchema = z
  .object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters long')
      .optional(),
  })
  .refine(
    (v) => (v.newPassword === undefined) === (v.currentPassword === undefined),
    {
      message: 'currentPassword and newPassword go together',
    },
  )

export type UpdateMeBody = z.infer<typeof updateMeSchema>
