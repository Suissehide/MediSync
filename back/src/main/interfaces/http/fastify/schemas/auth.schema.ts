import { z } from 'zod/v4'

export const userEntity = {
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['NONE', 'USER', 'ADMIN']).optional(),
}

export const registerSchema = z.object({
  ...userEntity,
  password: z.string({
    error: () => 'Password is required',
  }),
})
export const registerResponseSchema = z.object({
  ...userEntity,
  id: z.string(),
})

export const signInSchema = z.object({
  email: z.email({
    error: (issue) =>
      issue.input === undefined ? 'Email is required' : 'Email is not valid',
  }),
  password: z.string(),
})
export const signInResponseSchema = z.object({
  email: z.string(),
  firstName: z.string().nullish(),
  lastName: z.string().nullish(),
})

export type SignInInput = z.infer<typeof signInSchema>
export type CreateUserInput = z.infer<typeof registerSchema>
