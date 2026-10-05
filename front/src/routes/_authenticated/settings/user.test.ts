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
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

// Le cas du rebond : membre de service d'un etablissement, administrateur
// d'un AUTRE. `defaultTenantContext` rend le couple de `e1` (le seul avec un
// service) ; viser l'administration de `e1` serait refuse faute du role, et
// renverrait vers le choix de contexte — alors que l'ecran des membres existe
// bel et bien pour ce compte, sous `e2`.
const membreIciAdministrateurLaBas: User = {
  id: 'u4',
  email: 'mixte@b.fr',
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
    { id: 'e2', name: 'Clinique', role: 'ADMIN', services: [] },
  ],
}

// Administrateur de deux etablissements, dont le second porte le seul service
// accessible : la destination doit suivre ce dernier couple plutot que le
// premier etablissement de l'arbre.
const administrateurDeDeux: User = {
  id: 'u5',
  email: 'double@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'ADMIN', services: [] },
    {
      id: 'e2',
      name: 'Clinique',
      role: 'ADMIN',
      services: [{ id: 's2', name: 'Neuro', role: 'COORDINATEUR' }],
    },
  ],
}

// Membre partout, administrateur nulle part : l'ecran des membres n'existe
// pour ce compte dans aucun etablissement.
const membrePartout: User = {
  id: 'u6',
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
  it('redirige vers l administration de l etablissement, recherche conservee', () => {
    expect(() => runBeforeLoad(user)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/admin',
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
        to: '/e/$establishmentId/admin',
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

  // Le verrou du rebond. Avec l'ordre inverse — `defaultTenantContext`
  // d'abord — la destination etait `e1`, que ce compte n'administre pas : le
  // layout d'administration la refusait et renvoyait vers le choix de
  // contexte. La destination doit se resoudre sur les etablissements
  // ADMINISTRES, donc `e2`.
  it('envoie vers l etablissement ADMINISTRE, pas vers celui ou le compte est simple membre', () => {
    expect(() => runBeforeLoad(membreIciAdministrateurLaBas)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/admin',
        params: { establishmentId: 'e2' },
        search: true,
      }),
    )
  })

  // `defaultTenantContext` n'est plus la source de la destination, mais il
  // reste le critere de preference entre plusieurs etablissements administres
  // — sans quoi cet administrateur-la serait toujours ramene a `e1`.
  it('prefere, parmi les etablissements administres, celui du dernier couple accessible', () => {
    expect(() => runBeforeLoad(administrateurDeDeux)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/admin',
        params: { establishmentId: 'e2' },
        search: true,
      }),
    )
  })

  // Aucun etablissement administre mais un service accessible : viser une URL
  // d'administration ne ferait que provoquer le rebond qu'on vient de fermer.
  // On envoie directement la ou le layout aurait envoye, sans le detour.
  it('envoie au choix de contexte un compte sans aucune administration', () => {
    expect(() => runBeforeLoad(membrePartout)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/choose-context' }),
    )
  })
})
