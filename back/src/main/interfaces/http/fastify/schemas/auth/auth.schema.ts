import { z } from 'zod'

const userEntity = {
  email: z
    .string({
      required_error: 'Email is required',
      invalid_type_error: 'Email is not valid',
    })
    .email(),
  firstname: z.string(),
  lastname: z.string(),
}

export const registerSchema = z.object({
  ...userEntity,
  password: z.string({
    required_error: 'Password is required',
  }),
})
export const registerResponseSchema = z.object({
  ...userEntity,
  id: z.string(),
})

export const signInSchema = z.object({
  email: z
    .string({
      required_error: 'Email is required',
      invalid_type_error: 'Email is not valid',
    })
    .email(),
  password: z.string(),
})
export const signInResponseSchema = z.object({
  email: z.string(),
  firstname: z.string().nullish(),
  lastname: z.string().nullish(),
})

export type SignInInput = z.infer<typeof signInSchema>
export type CreateUserInput = z.infer<typeof registerSchema>
