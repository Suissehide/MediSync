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
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
}

// Le cas que la garde empechait de rencontrer : un
// administrateur d'etablissement qui n'a plus aucune affectation de service
// (par exemple apres avoir vide sa propre liste, desormais permis).
const adminSansService: User = {
  id: 'u2',
  email: 'admin@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [{ id: 'e1', name: 'CHU', role: 'ADMIN', services: [] }],
}

const sansAcces: User = {
  id: 'u3',
  email: 'personne@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [],
}

// L'etat exact qu'un compte laisse par
// le script d'amorcage porte reellement — le drapeau posE,
// aucun rattachement (le script ne cree jamais d'appartenance). Avant ce
// correctif, ce compte tombait sur /pending, qui lui ment (il n'attend rien).
const superAdminSansEtablissement: User = {
  id: 'sa1',
  email: 'super@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [],
}

// Un compte peut porter isSuperAdmin ET
// exercer réellement quelque part (le drapeau n'exclut rien côté back — un
// même compte peut être praticien dans un établissement). La garde
// isSuperAdmin est placée APRÈS les deux vérifications de tenant dans
// index.tsx ; rien ne garantit que cet ordre survive à une réécriture
// future sans ce test.
const superAdminAvecService: User = {
  id: 'sa2',
  email: 'super-praticien@medisync.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: true,
  establishments: [
    {
      id: 'e1',
      name: 'CHU',
      role: 'MEMBER',
      services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }],
    },
  ],
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

  // Le defaut : sans ce cas, cet administrateur
  // retombait sur /pending, un ecran sans aucun lien sortant — la meme
  // impasse qu'une garde desormais supprimee empechait par un autre moyen.
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

  // Sans ce cas, un super-admin fraichement
  // amorce (isSuperAdmin: true, aucun etablissement) retombait sur /pending —
  // un ecran qui lui annonce a tort etre en attente d'approbation, et qui ne
  // monte pas DashboardLayout, donc aucune barre laterale, donc aucun moyen
  // d'atteindre /super-admin autrement qu'en tapant l'URL a la main.
  it('envoie un super-admin sans aucun etablissement vers /super-admin, jamais vers /pending', () => {
    expect(() => runBeforeLoad(superAdminSansEtablissement)).toThrow(
      expect.objectContaining({ isRedirect: true, to: '/super-admin' }),
    )
  })

  // Un super-admin qui exerce aussi comme praticien
  // retrouve son tableau de bord de service, jamais /super-admin — la garde
  // du drapeau ne doit s'appliquer qu'en dernier recours, après le couple
  // service/établissement et l'établissement administré.
  it('envoie un super-admin qui a par ailleurs un couple etablissement/service vers son tableau de bord, jamais vers /super-admin', () => {
    expect(() => runBeforeLoad(superAdminAvecService)).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/s/$serviceId/dashboard',
        params: { establishmentId: 'e1', serviceId: 's1' },
      }),
    )
  })
})
