import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'

import { Route } from './index.tsx'

const userAvecService: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      soignantId: null,
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
}

// Le cas que le garde de l'etape 1 empechait de rencontrer : un
// administrateur d'etablissement qui n'a plus aucune affectation de service
// (par exemple apres avoir vide sa propre liste, desormais permis).
const adminSansService: User = {
  id: 'u2',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', soignantId: null, services: [] },
  ],
}

const sansAcces: User = {
  id: 'u3',
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

describe('beforeLoad de l index authentifie', () => {
  it('envoie vers le tableau de bord du service par defaut quand un couple existe', () => {
    expect(() => runBeforeLoad(userAvecService)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: { establishmentId: 'e1', serviceId: 's1' },
      }),
    )
  })

  // Le defaut que la revue a releve : sans ce cas, cet administrateur
  // retombait sur /pending, un ecran sans aucun lien sortant — la meme
  // impasse que le garde supprime en tache 15 empechait par un autre moyen.
  it('envoie un administrateur sans aucune affectation de service vers son administration', () => {
    expect(() => runBeforeLoad(adminSansService)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/admin/members',
        params: { establishmentId: 'e1' },
      }),
    )
  })

  it('envoie qui n a reellement aucun acces vers l ecran d attente', () => {
    expect(() => runBeforeLoad(sansAcces)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/pending' }),
    )
  })
})
