import { z } from 'zod/v4'

import { meResponseSchema } from './me.schema'

export const userSchema = z.object({
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

export const registerSchema = userSchema
  .pick({
    email: true,
    firstName: true,
    lastName: true,
  })
  .extend({
    password: z
      .string({
        error: () => 'Password is required',
      })
      .min(12, 'Password must be at least 12 characters long'),
  })
export const registerResponseSchema = userSchema.extend({
  id: z.string(),
})

export const signInSchema = z.object({
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  password: z.string(),
})
export const signInResponseSchema = meResponseSchema

export type SignInInput = z.infer<typeof signInSchema>
export type CreateUserInput = z.infer<typeof registerSchema>

// Le jeton passe dans le CORPS d'un POST, jamais dans une URL (spec §6.1) : cette forme est ce
// qui l'exige — il n'existe aucun paramètre d'URL ni de query pour ce champ.
export const accessLinkConsumeSchema = z.object({
  token: z.string({
    error: () => 'Token is required',
  }),
  password: z
    .string({
      error: () => 'Password is required',
    })
    .min(12, 'Password must be at least 12 characters long'),
})
export const accessLinkConsumeResponseSchema = z.object({
  success: z.boolean(),
})

export type AccessLinkConsumeInput = z.infer<typeof accessLinkConsumeSchema>

export const passwordForgotSchema = signInSchema.pick({ email: true })
export type PasswordForgotInput = z.infer<typeof passwordForgotSchema>
