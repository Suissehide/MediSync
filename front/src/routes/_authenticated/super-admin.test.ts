import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'

import { Route } from './super-admin.tsx'

// Meme style de harnais que `e/$establishmentId/admin.test.ts` : la garde de
// route se teste avec l'objet minimal qu'elle lit reellement (`context`),
// sans monter de routeur complet.
const runBeforeLoad = (user: User) => {
  const beforeLoad = Route.options.beforeLoad
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant sur la route /super-admin')
  }
  return beforeLoad({
    context: { authState: { isAuthenticated: true, user } },
  } as Parameters<typeof beforeLoad>[0])
}

const superAdmin: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

const compteOrdinaire: User = {
  id: 'u1',
  email: 'membre@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] },
  ],
}

describe('beforeLoad du layout /super-admin', () => {
  it('laisse passer un compte avec le drapeau isSuperAdmin', () => {
    expect(() => runBeforeLoad(superAdmin)).not.toThrow()
  })

  // Le back rend 404 (jamais 403) a qui n'a pas le drapeau — `requireSuperAdmin`,
  // super-admin.routes.ts : meme parti pris cote front, une redirection
  // silencieuse vers le tableau de bord, jamais un ecran qui annoncerait
  // l'existence de cette zone (task-12-brief.md).
  it("refuse un compte authentifie sans le drapeau isSuperAdmin, meme administrateur d'etablissement", () => {
    expect(() => runBeforeLoad(compteOrdinaire)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/' }),
    )
  })
})
