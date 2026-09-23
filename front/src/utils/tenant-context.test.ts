import { beforeEach, describe, expect, it } from 'vitest'

import type { User } from '@/types/auth.ts'
import {
  defaultTenantContext,
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

  it('rend null pour un utilisateur sans appartenance', () => {
    expect(defaultTenantContext({ ...user, establishments: [] })).toBeNull()
    expect(defaultTenantContext(null)).toBeNull()
  })
})
