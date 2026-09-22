import Boom from '@hapi/boom'

import { assertRoutePermission, resolveTenantFromUser } from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'

const now = new Date()
const user: UserWithMemberships = {
  id: 'u1', email: 'a@b.fr', password: '', salt: '', firstName: null, lastName: null,
  isSuperAdmin: false, deactivatedAt: null,
  establishmentMemberships: [{
    id: 'em1', userId: 'u1', establishmentId: 'e1', role: 'MEMBER', soignantId: 'so1', createdAt: now,
    establishment: { id: 'e1', name: 'E', createdAt: now, deactivatedAt: null },
    serviceMemberships: [
      { id: 'sm1', establishmentMembershipId: 'em1', serviceId: 's1', establishmentId: 'e1', role: 'INTERVENANT', createdAt: now,
        service: { id: 's1', establishmentId: 'e1', name: 'S1', createdAt: now, deactivatedAt: null } },
      { id: 'sm2', establishmentMembershipId: 'em1', serviceId: 's2', establishmentId: 'e1', role: 'LECTURE', createdAt: now,
        service: { id: 's2', establishmentId: 'e1', name: 'S2', createdAt: now, deactivatedAt: now } },
    ],
  }],
}

describe('resolveTenantFromUser', () => {
  it('resout un couple etablissement/service dont l utilisateur est membre', () => {
    expect(resolveTenantFromUser(user, { establishmentId: 'e1', serviceId: 's1' }, { requireEstablishmentAdmin: false }))
      .toEqual({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'MEMBER', serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so1' })
  })

  it('renvoie 404 pour un service inconnu, desactive, ou un etablissement etranger', () => {
    for (const params of [
      { establishmentId: 'e1', serviceId: 'nope' },
      { establishmentId: 'e1', serviceId: 's2' },
      { establishmentId: 'e9', serviceId: 's1' },
    ]) {
      expect(() => resolveTenantFromUser(user, params, { requireEstablishmentAdmin: false }))
        .toThrow(expect.objectContaining({ output: expect.objectContaining({ statusCode: 404 }) }))
    }
  })

  it('assertRoutePermission refuse une route sans permission', () => {
    expect(() => assertRoutePermission({ method: 'GET', url: '/x', config: {} })).toThrow(/without permission/)
    expect(() => assertRoutePermission({ method: 'GET', url: '/x', config: { permission: 'planning:read' } })).not.toThrow()
  })

  it('exige le role ADMIN pour le contexte d administration', () => {
    expect(() => resolveTenantFromUser(user, { establishmentId: 'e1' }, { requireEstablishmentAdmin: true }))
      .toThrow(Boom.Boom)
    const admin = { ...user, establishmentMemberships: [{ ...user.establishmentMemberships[0], role: 'ADMIN' as const }] }
    expect(resolveTenantFromUser(admin, { establishmentId: 'e1' }, { requireEstablishmentAdmin: true }))
      .toEqual({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'ADMIN', serviceId: null, serviceRole: null, soignantId: 'so1' })
  })
})
