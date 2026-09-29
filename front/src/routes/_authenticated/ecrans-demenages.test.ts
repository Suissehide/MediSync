import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'

import { Route as ancienJournalDeService } from './e/$establishmentId/s/$serviceId/activity-log.tsx'
import { Route as ancienJournal } from './settings/activity-log.tsx'

// Navigation par echelle (2026-09-28) : le journal d'activite a quitte l'echelle du service. Ses
// anciennes adresses — sous un service, et plus anciennes encore, sans tenant — menent a
// l'administration de l'etablissement, parametres de recherche compris (`search: true`, que
// TanStack Router ne pose pas de lui-meme : voir decisions-etape-2.md). Soignants et Salles, eux,
// sont revenus dans le service le 2026-09-29 : leurs adresses sont de nouveau des ecrans.

type AvecBeforeLoad = { options: { beforeLoad?: unknown } }

const lancer = (route: AvecBeforeLoad, argument: unknown) => {
  const beforeLoad = route.options.beforeLoad as ((a: unknown) => unknown) | undefined
  if (!beforeLoad) {
    throw new Error('beforeLoad manquant')
  }
  return beforeLoad(argument)
}

const admin: User = {
  id: 'u1',
  email: 'a@b.fr',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  establishments: [
    { id: 'e1', name: 'CHU', role: 'MEMBER', services: [{ id: 's1', name: 'Cardio', role: 'INTERVENANT' }] },
    { id: 'e2', name: 'Clinique', role: 'ADMIN', services: [] },
  ],
}

describe('anciennes adresses de service des ecrans demenages', () => {
  it.each([
    ['activity-log', ancienJournalDeService, '/e/$establishmentId/admin/activity-log'],
  ])('%s mene a l administration du meme etablissement, recherche comprise', (_, route, cible) => {
    expect(() => lancer(route, { params: { establishmentId: 'e9', serviceId: 's9' } })).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: cible,
        params: { establishmentId: 'e9' },
        search: true,
      }),
    )
  })
})

describe('anciennes adresses sans tenant des ecrans demenages', () => {
  it.each([
    ['activity-log', ancienJournal, '/e/$establishmentId/admin/activity-log'],
  ])('%s mene a l administration du premier etablissement administre', (_, route, cible) => {
    expect(() => lancer(route, { context: { authState: { isAuthenticated: true, user: admin } } })).toThrow(
      expect.objectContaining({ isRedirect: true, to: cible, params: { establishmentId: 'e2' }, search: true }),
    )
  })

  it('renvoie au choix des acces un compte qui n administre aucun etablissement', () => {
    const sansAdministration: User = { ...admin, establishments: [admin.establishments[0]] }
    expect(() =>
      lancer(ancienJournal, { context: { authState: { isAuthenticated: true, user: sansAdministration } } }),
    ).toThrow(expect.objectContaining({ isRedirect: true, to: '/choose-context' }))
  })
})
