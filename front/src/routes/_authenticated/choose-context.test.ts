import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import { Route } from './choose-context.tsx'

const adminSansService: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

const sansAcces: User = {
  id: 'u2',
  email: 'personne@b.fr',
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

describe('beforeLoad de la page de choix de contexte', () => {
  // Sans administeredEstablishments, cette page renverrait a tort vers
  // /pending un administrateur qui n a plus aucun couple etablissement/
  // service, alors qu'un chemin existe pour lui (son administration).
  it('ne redirige pas vers /pending un administrateur sans aucune affectation de service', () => {
    expect(() => runBeforeLoad(adminSansService)).not.toThrow()
  })

  it('redirige vers /pending qui n a ni couple ni etablissement administre', () => {
    expect(() => runBeforeLoad(sansAcces)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/pending' }),
    )
  })

  it('ne redirige pas vers /pending un super-admin sans aucune appartenance', () => {
    expect(() =>
      runBeforeLoad({ ...sansAcces, isSuperAdmin: true }),
    ).not.toThrow()
  })
})
