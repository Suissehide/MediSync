import Boom from '@hapi/boom'

import { assertRoutePermission, assertTenantShapedRoute, resolveTenantFromUser } from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'

const now = new Date()
// L'appartenance est nommee a part : la reprendre par index perdrait son
// typage (noUncheckedIndexedAccess) dans le cas administrateur plus bas.
const membership: UserWithMemberships['establishmentMemberships'][number] = {
  id: 'em1', userId: 'u1', establishmentId: 'e1', role: 'MEMBER', soignantId: 'so1', createdAt: now,
  establishment: { id: 'e1', name: 'E', createdAt: now, deactivatedAt: null },
  serviceMemberships: [
    { id: 'sm1', establishmentMembershipId: 'em1', serviceId: 's1', establishmentId: 'e1', role: 'INTERVENANT', createdAt: now,
      service: { id: 's1', establishmentId: 'e1', name: 'S1', createdAt: now, deactivatedAt: null } },
    { id: 'sm2', establishmentMembershipId: 'em1', serviceId: 's2', establishmentId: 'e1', role: 'LECTURE', createdAt: now,
      service: { id: 's2', establishmentId: 'e1', name: 'S2', createdAt: now, deactivatedAt: now } },
  ],
}
const user: UserWithMemberships = {
  id: 'u1', email: 'a@b.fr', password: '', salt: '', firstName: null, lastName: null,
  isSuperAdmin: false, deactivatedAt: null,
  establishmentMemberships: [membership],
}

// `[]` explicite à chaque appel de `resolveTenantFromUser` ci-dessous : `grants` n'a plus de
// valeur par défaut (tour de correction 1, tâche 3) — précisément pour qu'un appel qui l'omet ne
// compile plus silencieusement dans `src/main`. Ce fichier n'est pas vérifié par `tsc` (voir
// back/CLAUDE.md), mais le dit explicitement plutôt que de s'appuyer sur l'ancien défaut.
describe('resolveTenantFromUser', () => {
  it('resout un couple etablissement/service dont l utilisateur est membre', () => {
    expect(resolveTenantFromUser(user, { establishmentId: 'e1', serviceId: 's1' }, { requireEstablishmentAdmin: false }, []))
      .toEqual({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'MEMBER', serviceId: 's1', serviceRole: 'INTERVENANT', soignantId: 'so1', origine: 'reelle' })
  })

  it('renvoie 404 pour un service inconnu, desactive, ou un etablissement etranger', () => {
    for (const params of [
      { establishmentId: 'e1', serviceId: 'nope' },
      { establishmentId: 'e1', serviceId: 's2' },
      { establishmentId: 'e9', serviceId: 's1' },
    ]) {
      expect(() => resolveTenantFromUser(user, params, { requireEstablishmentAdmin: false }, []))
        .toThrow(expect.objectContaining({ output: expect.objectContaining({ statusCode: 404 }) }))
    }
  })

  it('assertRoutePermission refuse une route sans permission', () => {
    expect(() => assertRoutePermission({ method: 'GET', url: '/x', config: {} })).toThrow(/without permission/)
    expect(() => assertRoutePermission({ method: 'GET', url: '/x', config: { permission: 'planning:read' } })).not.toThrow()
  })

  // Garde de racine : `assertRoutePermission` ne voit que les routes posees
  // sous les deux plugins de tenant. Celle-ci juge sur la forme de l'URL, donc
  // couvre une route de forme multi-tenant enregistree ailleurs, qui
  // echapperait sinon a la resolution, a la permission et au filtrage
  // clinique sans que rien ne le signale.
  it('assertTenantShapedRoute exige une permission des que l URL porte un etablissement', () => {
    const tenantUrl = '/e/:establishmentId/s/:serviceId/patient'
    const adminUrl = '/e/:establishmentId/admin/members'
    expect(() => assertTenantShapedRoute({ method: 'GET', url: tenantUrl, config: {} }))
      .toThrow(/without permission/)
    expect(() => assertTenantShapedRoute({ method: 'GET', url: adminUrl, config: {} }))
      .toThrow(/without permission/)
    expect(() => assertTenantShapedRoute({ method: 'GET', url: tenantUrl, config: { permission: 'patient:read' } }))
      .not.toThrow()
    // Une route hors tenant reste libre de ne rien declarer.
    expect(() => assertTenantShapedRoute({ method: 'GET', url: '/health', config: {} }))
      .not.toThrow()
    expect(() => assertTenantShapedRoute({ method: 'POST', url: '/auth/sign-in', config: {} }))
      .not.toThrow()
  })

  it('exige le role ADMIN pour le contexte d administration', () => {
    expect(() => resolveTenantFromUser(user, { establishmentId: 'e1' }, { requireEstablishmentAdmin: true }, []))
      .toThrow(Boom.Boom)
    const admin = { ...user, establishmentMemberships: [{ ...membership, role: 'ADMIN' as const }] }
    expect(resolveTenantFromUser(admin, { establishmentId: 'e1' }, { requireEstablishmentAdmin: true }, []))
      .toEqual({ userId: 'u1', establishmentId: 'e1', establishmentRole: 'ADMIN', serviceId: null, serviceRole: null, soignantId: 'so1', origine: 'reelle' })
  })

  // Etape 4b, tache 2 : `origine` doit distinguer un octroi temporaire d'une appartenance
  // reelle jusque dans le `Tenant` resolu — pas seulement dans `EffectiveMembership`
  // (accessGrant.domain.ts), qui l'a toujours porte. Sans ce test, un retrait silencieux de
  // `origine: membership.origine` dans `resolveTenantFromUser` (les deux `return`) laisserait
  // le test precedent au vert (il ne couvre qu'une appartenance reelle) alors que le journal des
  // consultations (`PatientAccessLogDomain.record`) ne verrait plus jamais d'octroi.
  it('porte origine: octroi pour un super-admin qui n a aucune appartenance reelle a cet etablissement', () => {
    const superAdmin: UserWithMemberships = {
      ...user,
      isSuperAdmin: true,
      establishmentMemberships: [],
    }
    const grant = {
      establishmentId: 'e9',
      establishmentName: 'Etablissement sous octroi',
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      services: [{ id: 's9', name: 'S9' }],
    }
    expect(
      resolveTenantFromUser(superAdmin, { establishmentId: 'e9', serviceId: 's9' }, { requireEstablishmentAdmin: false }, [grant], now),
    ).toEqual({
      userId: 'u1', establishmentId: 'e9', establishmentRole: 'ADMIN',
      serviceId: 's9', serviceRole: 'COORDINATEUR', soignantId: null, origine: 'octroi',
    })
  })

  // TOUR DE CORRECTION 1 (revue) — le test precedent ne croise l'octroi qu'avec la branche
  // SERVICE (`requireEstablishmentAdmin: false`) de `resolveTenantFromUser`. Celle-ci a une
  // seconde branche, l'administration d'etablissement (`requireEstablishmentAdmin: true`), avec
  // son propre `return` litteral qui pose aussi `origine: membership.origine` — jamais exercee
  // avec un octroi jusqu'ici. Un defaut propre a CETTE branche (par exemple un `return` qui
  // aurait oublie `origine`, ou l'aurait figee a `'reelle'`) ne serait vu par aucun des tests
  // existants : celui d'administration ci-dessus ne porte que sur une appartenance reelle, et
  // celui d'octroi ci-dessus ne passe que par la branche service.
  it('porte aussi origine: octroi dans le contexte d administration d etablissement', () => {
    const superAdmin: UserWithMemberships = {
      ...user,
      isSuperAdmin: true,
      establishmentMemberships: [],
    }
    const grant = {
      establishmentId: 'e9',
      establishmentName: 'Etablissement sous octroi',
      expiresAt: new Date(now.getTime() + 60_000),
      revokedAt: null,
      services: [{ id: 's9', name: 'S9' }],
    }
    expect(
      resolveTenantFromUser(superAdmin, { establishmentId: 'e9' }, { requireEstablishmentAdmin: true }, [grant], now),
    ).toEqual({
      userId: 'u1', establishmentId: 'e9', establishmentRole: 'ADMIN',
      serviceId: null, serviceRole: null, soignantId: null, origine: 'octroi',
    })
  })
})
