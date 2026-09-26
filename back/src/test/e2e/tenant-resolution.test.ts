import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  grantAccess,
  signIn,
  tenantUrl,
  twoServicesScenario,
} from './setup/fixtures'

// Ne fige QUE `Date` : les vrais minuteurs (setTimeout, l'E/S de la vraie base de test) restent
// réels, seule l'horloge que lit `resolveTenant` (interfaces/http/fastify/plugins/tenant.plugin.ts,
// `new Date()`) est sous contrôle — ce qui rend l'expiration d'un octroi éprouvable sans attendre.
const TIMERS_REELS = [
  'nextTick', 'hrtime', 'performance', 'queueMicrotask',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
] as const
const avancerHorloge = (ms: number): void => {
  jest.setSystemTime(new Date(Date.now() + ms))
}

// Bout en bout, cette fois : la résolution du tenant est déjà testée
// unitairement (`src/test/unit/interfaces/tenant-resolution.test.ts`) contre
// des appartenances construites à la main. Ici, la vraie base et les vraies
// routes tranchent : membre, autre service, autre établissement, service
// désactivé, compte désactivé.
describe('resolution du tenant', () => {
  let t: TestApp

  beforeAll(async () => {
    t = await buildTestApp()
  })

  // Chaque test recrée son établissement : purger évite les collisions
  // d'e-mail (`a@test.fr`, `b@test.fr`) entre les cas de ce fichier.
  beforeEach(truncateAll)

  afterAll(async () => {
    await t.close()
    await testDb.$disconnect()
  })

  it('membre -> 200 ; autre service -> 404 ; autre etablissement -> 404 ; service desactive -> 404 ; compte desactive -> 401', async () => {
    const { est, serviceA, serviceB, cookiesA } = await twoServicesScenario(
      t.app,
    )
    const other = await createEstablishment('Autre')
    const get = (url: string, cookies = cookiesA) =>
      t.app.inject({ method: 'GET', url, cookies })

    // Membre du service demandé : accès normal.
    expect(
      (await get(tenantUrl(est.id, serviceA.id, '/thematic'))).statusCode,
    ).toBe(200)
    // Membre de l'établissement mais pas de ce service-là.
    expect(
      (await get(tenantUrl(est.id, serviceB.id, '/thematic'))).statusCode,
    ).toBe(404)
    // Un autre établissement, même identifiant de service : jamais rencontré.
    expect(
      (await get(tenantUrl(other.id, serviceA.id, '/thematic'))).statusCode,
    ).toBe(404)

    // Service désactivé : la résolution du tenant le retire de l'arbre même
    // pour un membre.
    await testDb.service.update({
      where: { id: serviceA.id },
      data: { deactivatedAt: new Date() },
    })
    expect(
      (await get(tenantUrl(est.id, serviceA.id, '/thematic'))).statusCode,
    ).toBe(404)
    await testDb.service.update({
      where: { id: serviceA.id },
      data: { deactivatedAt: null },
    })

    // Compte désactivé : le cookie reste valide (le jeton n'expire pas tout
    // seul) mais l'identité globale est coupée avant même de résoudre le
    // tenant -> 401, pas 404.
    await testDb.user.update({
      where: { email: 'a@test.fr' },
      data: { deactivatedAt: new Date() },
    })
    expect(
      (await get(tenantUrl(est.id, serviceA.id, '/thematic'))).statusCode,
    ).toBe(401)
  })

  it('un etablissement desactive est egalement invisible a un membre', async () => {
    const { est, serviceA, cookiesA } = await twoServicesScenario(t.app)
    await testDb.establishment.update({
      where: { id: est.id },
      data: { deactivatedAt: new Date() },
    })

    const res = await t.app.inject({
      method: 'GET',
      url: tenantUrl(est.id, serviceA.id, '/thematic'),
      cookies: cookiesA,
    })
    expect(res.statusCode).toBe(404)
  })

  // Review Focus n°2 (tâche 3, étape 4a) : un octroi qui expire pendant une session déjà
  // ouverte doit être refusé dès la requête SUIVANTE, sans attendre une reconnexion — c'est la
  // raison d'être de l'évaluation à la lecture (`effectiveMemberships` appelée à chaque
  // résolution de tenant, jamais mise en cache). 404, pas 403 : la forme que
  // `resolveTenantFromUser` emploie déjà pour un tenant inconnu, pour ne pas révéler
  // l'existence d'un établissement auquel on n'a plus accès.
  it('refuse des que l octroi expire, sans attendre une reconnexion', async () => {
    const est = await createEstablishment('Octroi')
    const service = await createService(est.id, 'Service')
    const superAdmin = await createUser({
      email: 'super@test.fr',
      isSuperAdmin: true,
    })
    const cookies = await signIn(t.app, 'super@test.fr')

    jest.useFakeTimers({ doNotFake: [...TIMERS_REELS] })
    try {
      const maintenant = new Date()
      jest.setSystemTime(maintenant)

      // Octroi d'une seconde, posé avant la première requête.
      await grantAccess({
        userId: superAdmin.id,
        establishmentId: est.id,
        expiresAt: new Date(maintenant.getTime() + 1000),
      })

      const avant = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, service.id, '/patient'),
        cookies,
      })
      expect(avant.statusCode).toBe(200)

      // L'octroi est expiré depuis une seconde, sur le MÊME cookie de session.
      avancerHorloge(2000)

      const apres = await t.app.inject({
        method: 'GET',
        url: tenantUrl(est.id, service.id, '/patient'),
        cookies,
      })
      expect(apres.statusCode).toBe(404)
    } finally {
      jest.useRealTimers()
    }
  })

  it('/me renvoie l arbre des appartenances', async () => {
    const { est, serviceA, cookiesA } = await twoServicesScenario(t.app)
    const res = await t.app.inject({
      method: 'GET',
      url: '/me',
      cookies: cookiesA,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      establishments: [
        { id: est.id, services: [{ id: serviceA.id, role: 'COORDINATEUR' }] },
      ],
    })
  })
})
