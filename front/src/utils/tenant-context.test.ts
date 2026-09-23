import { beforeEach, describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import {
  accessibleCouples,
  defaultTenantContext,
  isTenantRouteStale,
  rememberContext,
  resolveEstablishmentContext,
  resolveTenantContext,
} from '@/utils/tenant-context.ts'

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
      services: [
        { id: 's1', name: 'Cardio', role: 'COORDINATEUR' },
        { id: 's2', name: 'Pneumo', role: 'LECTURE' },
      ],
    },
    {
      id: 'e2',
      name: 'Clinique',
      role: 'MEMBER',
      soignantId: null,
      services: [{ id: 's3', name: 'Reeduc', role: 'INTERVENANT' }],
    },
  ],
}

describe('resolveTenantContext', () => {
  it('resout un couple present dans les appartenances', () => {
    expect(resolveTenantContext(user, { establishmentId: 'e1', serviceId: 's2' })).toEqual({
      establishmentId: 'e1',
      serviceId: 's2',
      establishmentRole: 'ADMIN',
      serviceRole: 'LECTURE',
      soignantId: 'so1',
    })
  })

  it('refuse un service qui appartient a un autre etablissement', () => {
    expect(resolveTenantContext(user, { establishmentId: 'e2', serviceId: 's1' })).toBeNull()
  })

  it('refuse un etablissement inconnu, un service inconnu, un parametre manquant', () => {
    expect(resolveTenantContext(user, { establishmentId: 'zz', serviceId: 's1' })).toBeNull()
    expect(resolveTenantContext(user, { establishmentId: 'e1', serviceId: 'zz' })).toBeNull()
    expect(resolveTenantContext(user, { establishmentId: 'e1' })).toBeNull()
    expect(resolveTenantContext(null, { establishmentId: 'e1', serviceId: 's1' })).toBeNull()
  })
})

describe('resolveEstablishmentContext', () => {
  it('resout un etablissement dont on est administrateur, sans service', () => {
    expect(resolveEstablishmentContext(user, { establishmentId: 'e1' })).toEqual({
      establishmentId: 'e1',
      serviceId: null,
      establishmentRole: 'ADMIN',
      serviceRole: null,
      soignantId: 'so1',
    })
  })

  // Simple membre : l'ecran d'administration ne doit pas s'ouvrir, meme si
  // le back refuserait de toute facon.
  it('refuse un etablissement dont on n est que membre', () => {
    expect(resolveEstablishmentContext(user, { establishmentId: 'e2' })).toBeNull()
  })
})

describe('defaultTenantContext', () => {
  beforeEach(() => localStorage.clear())

  it('prend le premier couple quand rien n a ete visite', () => {
    expect(defaultTenantContext(user)?.serviceId).toBe('s1')
  })

  // Les gardes des taches suivantes lisent les roles pour decider des
  // permissions : un objet partiel (sans role) passerait a tort.
  it('rend l objet complet, roles compris, pour le premier couple', () => {
    expect(defaultTenantContext(user)).toEqual({
      establishmentId: 'e1',
      serviceId: 's1',
      establishmentRole: 'ADMIN',
      serviceRole: 'COORDINATEUR',
      soignantId: 'so1',
    })
  })

  it('reprend le dernier couple visite', () => {
    rememberContext('u1', resolveTenantContext(user, { establishmentId: 'e2', serviceId: 's3' })!)
    expect(defaultTenantContext(user)).toMatchObject({ establishmentId: 'e2', serviceId: 's3' })
  })

  // Affectation retiree entre deux sessions : le favori ne doit pas gagner
  // sur les appartenances reelles.
  it('ignore un dernier couple visite devenu invalide', () => {
    localStorage.setItem('medisync/last-context/u1', JSON.stringify({ establishmentId: 'e9', serviceId: 's9' }))
    expect(defaultTenantContext(user)?.serviceId).toBe('s1')
  })

  // Poste partage : le favori d'une personne ne doit pas etre propose a une
  // autre, d'ou la cle portant l'identifiant.
  it('ne lit pas le dernier couple d un autre utilisateur', () => {
    localStorage.setItem('medisync/last-context/autre', JSON.stringify({ establishmentId: 'e2', serviceId: 's3' }))
    expect(defaultTenantContext(user)?.serviceId).toBe('s1')
  })

  // Verrouille la cle elle-meme, pas seulement l'ignorance d'une cle deja
  // ecrite a la main : avec une cle globale (sans identifiant), memoriser le
  // contexte du second utilisateur ecraserait celui du premier.
  it('isole le dernier contexte de deux utilisateurs sur le meme poste', () => {
    const other: User = { ...user, id: 'u2' }
    rememberContext('u1', resolveTenantContext(user, { establishmentId: 'e1', serviceId: 's2' })!)
    rememberContext('u2', resolveTenantContext(other, { establishmentId: 'e2', serviceId: 's3' })!)
    expect(defaultTenantContext(user)?.serviceId).toBe('s2')
    expect(defaultTenantContext(other)?.serviceId).toBe('s3')
  })

  it('rend null pour un utilisateur sans appartenance', () => {
    expect(defaultTenantContext({ ...user, establishments: [] })).toBeNull()
    expect(defaultTenantContext(null)).toBeNull()
  })
})

// `isTenantRouteStale` tranche entre les deux causes d'un 404 de route de
// tenant, indiscernables cote back (tache 13, tour de correction 1) : une
// ressource absente du service courant (couple toujours dans l'arbre — 404
// legitime, aucune navigation) et un arbre des appartenances perime
// (couple disparu — direction confirmee du choix de contexte).
describe('isTenantRouteStale', () => {
  it('rend faux pour une ressource absente : le couple de service vise reste dans l arbre', () => {
    expect(isTenantRouteStale(user, '/e/e1/s/s1/patient/introuvable')).toBe(false)
  })

  it('rend vrai quand le service vise a disparu de l etablissement', () => {
    expect(isTenantRouteStale(user, '/e/e1/s/s9/patient/px')).toBe(true)
  })

  it('rend vrai quand l etablissement vise a disparu', () => {
    expect(isTenantRouteStale(user, '/e/e9/s/s1/patient/px')).toBe(true)
  })

  it('rend faux pour une route d administration d etablissement : l etablissement vise reste administre', () => {
    expect(isTenantRouteStale(user, '/e/e1/admin/soignant')).toBe(false)
  })

  // e2 : role MEMBER, pas ADMIN — l'ecran d'administration ne lui appartient
  // plus (ou jamais), meme si l'etablissement figure toujours dans l'arbre.
  it('rend vrai pour une route d administration sur un etablissement dont le role admin a disparu', () => {
    expect(isTenantRouteStale(user, '/e/e2/admin/soignant')).toBe(true)
  })

  it('rend vrai sans utilisateur : aucun couple ne peut plus se resoudre', () => {
    expect(isTenantRouteStale(null, '/e/e1/s/s1/patient/px')).toBe(true)
  })

  // Chemin qui ne correspond a aucune des deux formes de route de tenant :
  // ne devrait pas arriver depuis `fetchWithAuth`, qui filtre deja sur
  // `/e/`, mais la fonction reste totale plutot que de lever ou de deviner.
  it('rend faux pour un chemin qui ne designe pas une route de tenant reconnue', () => {
    expect(isTenantRouteStale(user, '/me')).toBe(false)
  })
})

describe('accessibleCouples', () => {
  it('aplatit tous les couples etablissement/service, dans l ordre de l arbre', () => {
    expect(accessibleCouples(user).map((c) => `${c.establishment.id}/${c.service.id}`)).toEqual([
      'e1/s1',
      'e1/s2',
      'e2/s3',
    ])
  })

  // Meme garde que le reste du module : un `user` nul ou un etablissement
  // sans service ne doit jamais faire lever `.flatMap`/`.map`.
  it('rend un tableau vide sans utilisateur ou sans service', () => {
    expect(accessibleCouples(null)).toEqual([])
    expect(accessibleCouples({ ...user, establishments: [] })).toEqual([])
  })
})
