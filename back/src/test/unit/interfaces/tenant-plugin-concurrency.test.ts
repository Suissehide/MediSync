import Fastify from 'fastify'

import { tenantPlugin } from '../../../main/interfaces/http/fastify/plugins/tenant.plugin'
import type { IocContainer } from '../../../main/types/application/ioc'
import type { UserWithMemberships } from '../../../main/types/infra/orm/repositories/user.repository.interface'
import { TenantContext } from '../../../main/utils/tenant-context'

// `tenantContext.enter` repose sur `AsyncLocalStorage.enterWith`, qui pose la
// valeur pour la chaine asynchrone courante et tout ce qui en decoule, sans
// borne de sortie explicite. Sa surete pour deux requetes HTTP concurrentes
// ne peut s'etablir qu'une fois branchee dans un vrai preHandler Fastify :
// c'est ce que ce test verifie, avec un vrai serveur et deux `inject`
// concurrents dont le chevauchement est force par une porte de
// synchronisation (pas une simple absence d'erreur sur une execution qui
// serait en realite sequentielle).
//
// Volontairement pas via le harnais e2e (`buildTestApp`) : celui-ci monte
// `routes/index.ts` en entier (auth, DB, tous les routeurs), ce qui melangerait
// ces preoccupations avec celle testee ici. Un serveur Fastify minimal avec le
// vrai plugin et le vrai `TenantContext` isole precisement ce qu'on veut prouver.

const now = new Date()

// Un seul utilisateur, membre de deux etablissements/services distincts :
// suffisant pour observer si le tenant de la requete B fuit vers la requete A.
const user: UserWithMemberships = {
  id: 'u1',
  email: 'a@b.fr',
  password: '',
  salt: '',
  firstName: null,
  lastName: null,
  isSuperAdmin: false,
  deactivatedAt: null,
  establishmentMemberships: [
    {
      id: 'em1',
      userId: 'u1',
      establishmentId: 'e1',
      role: 'MEMBER',
      createdAt: now,
      establishment: {
        id: 'e1',
        name: 'E1',
        createdAt: now,
        deactivatedAt: null,
      },
      serviceMemberships: [
        {
          id: 'sm1',
          establishmentMembershipId: 'em1',
          serviceId: 's1',
          establishmentId: 'e1',
          role: 'INTERVENANT',
          soignantId: null,
          createdAt: now,
          service: {
            id: 's1',
            establishmentId: 'e1',
            name: 'S1',
            createdAt: now,
            deactivatedAt: null,
          },
        },
      ],
    },
    {
      id: 'em2',
      userId: 'u1',
      establishmentId: 'e2',
      role: 'MEMBER',
      createdAt: now,
      establishment: {
        id: 'e2',
        name: 'E2',
        createdAt: now,
        deactivatedAt: null,
      },
      serviceMemberships: [
        {
          id: 'sm2',
          establishmentMembershipId: 'em2',
          serviceId: 's2',
          establishmentId: 'e2',
          role: 'COORDINATEUR',
          soignantId: null,
          createdAt: now,
          service: {
            id: 's2',
            establishmentId: 'e2',
            name: 'S2',
            createdAt: now,
            deactivatedAt: null,
          },
        },
      ],
    },
  ],
}

describe('tenantPlugin — isolation entre requetes concurrentes', () => {
  it('ne laisse pas le tenant d une requete fuiter vers une autre en vol', async () => {
    const tenantContext = new TenantContext()
    const fastify = Fastify()
    // `tenantContext` et `accessGrantRepository` sont les deux seuls lus par le plugin à
    // l'enregistrement (`resolveTenant`/`resolveEstablishmentAdmin`
    // consultent les octrois vivants de l'utilisateur) — pas besoin du reste du conteneur pour ce
    // test. Aucun octroi ici : le tableau vide suffit à isoler ce que ce test observe
    // (l'étanchéité du tenant entre deux requêtes concurrentes), sans rapport avec les octrois.
    const accessGrantRepository = { findForUser: () => Promise.resolve([]) }
    fastify.decorate('iocContainer', {
      tenantContext,
      accessGrantRepository,
    } as unknown as IocContainer)
    await fastify.register(tenantPlugin)

    fastify.addHook('onRequest', (request) => {
      request.currentUser = user
      return Promise.resolve()
    })

    // Porte de synchronisation : le handler ne repond qu'une fois que les
    // deux requetes l'ont atteint, ce qui garantit un chevauchement reel de
    // leurs traitements (et non une simple execution l'une après l'autre).
    let started = 0
    let release = (): void => undefined
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve
    })

    fastify.get(
      '/e/:establishmentId/s/:serviceId/probe',
      {
        onRequest: [fastify.resolveTenant],
        preHandler: [fastify.enforcePermission],
        config: { permission: 'planning:read' },
      },
      async () => {
        started += 1
        if (started === 2) {
          release()
        }
        await bothStarted
        return { tenant: tenantContext.current() }
      },
    )

    await fastify.ready()

    const [resA, resB] = await Promise.all([
      fastify.inject({ method: 'GET', url: '/e/e1/s/s1/probe' }),
      fastify.inject({ method: 'GET', url: '/e/e2/s/s2/probe' }),
    ])

    expect(started).toBe(2)
    expect(resA.statusCode).toBe(200)
    expect(resB.statusCode).toBe(200)
    expect(resA.json().tenant).toEqual(
      expect.objectContaining({
        establishmentId: 'e1',
        serviceId: 's1',
        serviceRole: 'INTERVENANT',
      }),
    )
    expect(resB.json().tenant).toEqual(
      expect.objectContaining({
        establishmentId: 'e2',
        serviceId: 's2',
        serviceRole: 'COORDINATEUR',
      }),
    )

    await fastify.close()
  })
})
