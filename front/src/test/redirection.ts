import { expect } from 'vitest'

// Un redirect de TanStack Router est une Response : sa cible est dans `options`.
export const redirection = (options: Record<string, unknown>) =>
  expect.objectContaining({ options: expect.objectContaining(options) })
