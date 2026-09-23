import { describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import { redirectToDefaultService } from '@/utils/legacy-redirect.ts'

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
      soignantId: 'so1',
      services: [{ id: 's1', name: 'Cardio', role: 'COORDINATEUR' }],
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

describe('redirectToDefaultService', () => {
  it('cible le contexte par defaut avec les bons parametres de route', () => {
    expect(() =>
      redirectToDefaultService(user, '/e/$establishmentId/s/$serviceId/agenda'),
    ).toThrow(
      expect.objectContaining({
        isRedirect: true,
        to: '/e/$establishmentId/s/$serviceId/agenda',
        params: { establishmentId: 'e1', serviceId: 's1' },
      }),
    )
  })

  // Une URL mise en favori porte souvent des parametres de recherche (ex.
  // `/agenda?date=...`) : les perdre a la redirection viderait exactement
  // ce que ces redirections existent pour proteger. Le routeur reprend
  // ceux de l'URL entrante quand `search` vaut `true` dans les options de
  // `redirect()` ; sans cette mention explicite, la chaine de recherche
  // produite est vide (verifie dans la source du routeur, `buildLocation`).
  it('conserve les parametres de recherche entrants (search: true)', () => {
    expect(() =>
      redirectToDefaultService(user, '/e/$establishmentId/s/$serviceId/agenda'),
    ).toThrow(expect.objectContaining({ search: true }))
  })

  it('transmet les parametres additionnels (ex. patientID) en plus du contexte', () => {
    expect(() =>
      redirectToDefaultService(
        user,
        '/e/$establishmentId/s/$serviceId/patient/$patientID',
        { patientID: 'p1' },
      ),
    ).toThrow(
      expect.objectContaining({
        params: { establishmentId: 'e1', serviceId: 's1', patientID: 'p1' },
        search: true,
      }),
    )
  })

  it('redirige vers /pending sans contexte, sans pretendre en conserver la recherche', () => {
    expect(() =>
      redirectToDefaultService(userSansContexte, '/e/$establishmentId/s/$serviceId/agenda'),
    ).toThrow(expect.objectContaining({ isRedirect: true, to: '/pending' }))
  })
})
