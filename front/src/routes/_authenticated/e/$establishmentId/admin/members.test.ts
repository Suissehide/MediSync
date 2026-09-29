import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import { Route } from './members.tsx'

const admin: User = {
  id: 'u1',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

const member: User = {
  id: 'u2',
  email: 'membre@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
}

const stranger: User = {
  id: 'u3',
  email: 'etranger@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  // Authentifie, mais sans aucun rattachement a cet etablissement : c'est le
  // scenario du trou de permission ouvert par la tache 7 — l'ecran des
  // membres, deplace de /settings/user sans aucune garde, etait atteignable
  // par n'importe quel compte authentifie. `resolveEstablishmentContext`
  // renvoie ici `null` (aucun etablissement ne correspond), donc `can(null,
  // ...)` est faux et la garde redirige.
  establishments: [],
}

const params = { establishmentId: 'e1' }

const runBeforeLoad = (user: User) => {
  const beforeLoad = Route.options.beforeLoad
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant sur la route')
  }
  return beforeLoad({
    context: { authState: { isAuthenticated: true, user } },
    params,
  } as Parameters<typeof beforeLoad>[0])
}

describe('beforeLoad de l ecran Membres — garde members:manage', () => {
  it('laisse passer un administrateur de l etablissement', () => {
    expect(() => runBeforeLoad(admin)).not.toThrow()
  })

  it('refuse un simple membre de l etablissement (role MEMBER)', () => {
    expect(() => runBeforeLoad(member)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/' }),
    )
  })

  it('refuse un compte authentifie sans rattachement a cet etablissement', () => {
    expect(() => runBeforeLoad(stranger)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/' }),
    )
  })
})
