import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'

import { Route } from './user.tsx'

const user: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'ADMIN',
      soignantId: null,
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

const userSansContexte: User = {
  id: 'u2',
  email: 'b@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [],
}

const runBeforeLoad = (user: User) => {
  const beforeLoad = Route.options.beforeLoad
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant sur la route')
  }
  return beforeLoad({
    context: { authState: { isAuthenticated: true, user } },
  } as Parameters<typeof beforeLoad>[0])
}

describe('beforeLoad de l ancienne URL /settings/user', () => {
  it('redirige vers l administration des membres de l etablissement, recherche conservee', () => {
    expect(() => runBeforeLoad(user)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: 'e1' },
        search: true,
      }),
    )
  })

  it('redirige vers /pending sans contexte', () => {
    expect(() => runBeforeLoad(userSansContexte)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/pending' }),
    )
  })
})
