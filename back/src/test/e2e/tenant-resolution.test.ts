import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  tenantUrl,
  twoServicesScenario,
} from './setup/fixtures'

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
