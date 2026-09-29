import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import { Route as journal } from './activity-log.tsx'

// Navigation par echelle (2026-09-28) : le journal d'activite, rejoint par l'administration
// d'etablissement, se garde comme Membres (`members.test.ts`) — par sa permission
// d'etablissement, reservee a l'ADMIN — et s'ouvre enfin a un administrateur SANS aucune
// affectation de service, le compte que son ancien emplacement laissait a la porte.

const adminSansService: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

// Le role metier du service : le journal lui reste ferme.
const coordinateur: User = {
  ...adminSansService,
  id: 'u2',
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

type AvecBeforeLoad = { options: { beforeLoad?: unknown } }

const lancer = (route: AvecBeforeLoad, user: User) => {
  const beforeLoad = route.options.beforeLoad as
    | ((a: unknown) => unknown)
    | undefined
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant')
  }
  return beforeLoad({
    context: { authState: { isAuthenticated: true, user } },
    params: { establishmentId: 'e1' },
  })
}

describe.each([["Journal d'activite", journal]])(
  'garde de l ecran %s',
  (_, route) => {
    it('laisse passer un administrateur sans aucune affectation de service', () => {
      expect(() => lancer(route, adminSansService)).not.toThrow()
    })

    it('refuse un coordinateur, qui n administre pas l etablissement', () => {
      expect(() => lancer(route, coordinateur)).toThrow(
        expect.objectContaining({ isRedirect: true, to: '/' }),
      )
    })
  },
)
