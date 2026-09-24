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

// L'ancien favori de l'ecran Membres est d'abord celui d'un administrateur —
// et un administrateur peut n'avoir aucune affectation de service. Son acces
// existe pourtant, sous une URL sans service : c'est le cas que `index.tsx`
// couvrait deja et que celui-ci ne couvrait pas.
const adminSansService: User = {
  id: 'u3',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] },
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

  // Sans ce repli, cet administrateur atterrissait sur l'ecran d'attente,
  // qui n'a aucun lien sortant hormis la deconnexion : l'impasse que la tache
  // 15 avait fermee sur `index.tsx` restait ouverte par ce favori-ci.
  it('envoie un administrateur sans affectation de service vers son administration', () => {
    expect(() => runBeforeLoad(adminSansService)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: 'e1' },
        search: true,
      }),
    )
  })

  it('redirige vers /pending sans aucun acces, ni service ni administration', () => {
    expect(() => runBeforeLoad(userSansContexte)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/pending' }),
    )
  })
})
