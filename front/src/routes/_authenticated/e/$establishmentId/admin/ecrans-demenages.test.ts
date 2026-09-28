import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'

import { Route as journal } from './activity-log.tsx'
import { Route as salles } from './locations.tsx'
import { Route as soignants } from './soignants.tsx'

// Navigation par echelle (2026-09-28) : les trois ecrans rejoints par l'administration
// d'etablissement se gardent comme Membres (`members.test.ts`) — par leur permission
// d'etablissement, reservee a l'ADMIN — et s'ouvrent enfin a un administrateur SANS aucune
// affectation de service, le compte que leur ancien emplacement laissait a la porte.

const adminSansService: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] }],
}

// Le role metier du service : Soignants et Salles lui restent fermes (decision du 2026-09-28).
const coordinateur: User = {
  ...adminSansService,
  id: 'u2',
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      soignantId: null,
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
    },
  ],
}

type AvecBeforeLoad = { options: { beforeLoad?: unknown } }

const lancer = (route: AvecBeforeLoad, user: User) => {
  const beforeLoad = route.options.beforeLoad as ((a: unknown) => unknown) | undefined
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant')
  }
  return beforeLoad({
    context: { authState: { isAuthenticated: true, user } },
    params: { establishmentId: 'e1' },
  })
}

describe.each([
  ['Soignants', soignants],
  ['Salles', salles],
  ["Journal d'activite", journal],
])('garde de l ecran %s', (_, route) => {
  it('laisse passer un administrateur sans aucune affectation de service', () => {
    expect(() => lancer(route, adminSansService)).not.toThrow()
  })

  it('refuse un coordinateur, qui n administre pas l etablissement', () => {
    expect(() => lancer(route, coordinateur)).toThrow(expect.objectContaining({ isRedirect: true, to: '/' }))
  })
})
