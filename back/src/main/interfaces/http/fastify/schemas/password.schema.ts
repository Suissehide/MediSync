import { z } from 'zod/v4'

// 8 caractères et les quatre types (recommandation CNIL avec limitation des tentatives).
// Miroir côté front : `front/src/libs/password.ts`.
export const passwordSchema = z
  .string({ error: () => 'Password is required' })
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character')
