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
  'nextTick',
  'hrtime',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
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

  // Un octroi qui expire pendant une session déjà
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

  // Retirer le drapeau super-admin
  // ne retirait pas l'accès. Jugé à la lecture, comme l'expiration : la requête suivante, sur le
  // MÊME cookie, referme l'accès sans reconnexion.
  it('l octroi ne confere plus rien des que son titulaire n est plus super-admin', async () => {
    const est = await createEstablishment('Octroi')
    const service = await createService(est.id, 'Service')
    const superAdmin = await createUser({
      email: 'super@test.fr',
      isSuperAdmin: true,
    })
    const cookies = await signIn(t.app, 'super@test.fr')

    await grantAccess({
      userId: superAdmin.id,
      establishmentId: est.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const avant = await t.app.inject({
      method: 'GET',
      url: tenantUrl(est.id, service.id, '/patient'),
      cookies,
    })
    expect(avant.statusCode).toBe(200)

    // Le drapeau est retiré, l'octroi lui-même reste en base, non expiré, non révoqué.
    await testDb.user.update({
      where: { id: superAdmin.id },
      data: { isSuperAdmin: false },
    })

    const apres = await t.app.inject({
      method: 'GET',
      url: tenantUrl(est.id, service.id, '/patient'),
      cookies,
    })
    expect(apres.statusCode).toBe(404)
  })

  // Reconstruit EXACTEMENT le scénario démontré par exécution : un compte réellement démis du
  // drapeau super-admin,
  // dont l'octroi (non révoqué, non expiré) reste en base, appelé DIRECTEMENT au niveau du
  // dépôt — le point d'entrée le plus bas, celui qu'un appelant fabriqué atteindrait, sans
  // passer par `/me` ni par une session HTTP. Avant ce correctif, `liveGrantsForUser` acceptait un
  // `User` complet et faisait confiance à SON champ `isSuperAdmin` : un appel direct au dépôt
  // avec l'id de ce compte démis, depuis n'importe quel code de `src/main`, aurait tout de même
  // fait ressortir l'octroi RÉEL (établissement, services) si l'appelant avait — à tort —
  // prétendu `isSuperAdmin: true`. Désormais, `AccessGrantRepository.findForUser` ne prend
  // plus qu'un `userId` et relit LUI-MÊME `User.isSuperAdmin`, frais, à chaque appel : aucune
  // prétention d'aucune sorte ne peut plus rien changer au résultat. Ce test rougit si cette
  // relecture fraîche disparaît (par exemple si `findForUser` redevenait un simple filtre sur
  // `revokedAt`, sans revérifier le drapeau).
  it('la lecture directe du depot ne fait plus confiance a une pretention isSuperAdmin', async () => {
    const est = await createEstablishment('Octroi')
    const ancienSuperAdmin = await createUser({
      email: 'demis@test.fr',
      isSuperAdmin: true,
    })

    await grantAccess({
      userId: ancienSuperAdmin.id,
      establishmentId: est.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    // Démis APRÈS l'octroi : la ligne `SuperAdminAccessGrant` reste non révoquée, non expirée.
    await testDb.user.update({
      where: { id: ancienSuperAdmin.id },
      data: { isSuperAdmin: false },
    })

    // Appel DIRECT du dépôt, avec le seul `userId` — c'est tout ce que la nouvelle signature
    // accepte : il n'existe plus de champ `isSuperAdmin` où écrire une prétention.
    const grants = await t.instances.accessGrantRepository.findForUser(
      ancienSuperAdmin.id,
    )
    expect(grants).toEqual([])
  })

  // Fermeture (voir le contrat écrit sur
  // `AccessGrantRepositoryInterface.findForUser`) : un octroi RÉEL, non révoqué, non expiré, sur
  // un établissement qui devient désactivé APRÈS coup, ne doit plus rien conférer — ni la lecture
  // (`/me` ne le liste plus), ni l'entrée en tenant (404, comme pour un membre réel, voir « un
  // etablissement desactive est egalement invisible a un membre » ci-dessus). Ce test rougit si
  // le filtre `deactivatedAt: null` disparaît de la lecture d'`Establishment` dans
  // `AccessGrantRepository.findForUser` (infra/orm/repositories/accessGrant.repository.ts) :
  // sans lui, l'octroi resterait vivant et rendrait un rôle ADMIN sur un établissement désactivé
  // — build, lint, unitaires et e2e restaient tous verts sans ce cas avant cette tâche.
  it('un octroi sur un etablissement desactive ne redonne rien', async () => {
    const est = await createEstablishment('Octroi desactive')
    const service = await createService(est.id, 'Service')
    const superAdmin = await createUser({
      email: 'super@test.fr',
      isSuperAdmin: true,
    })
    const cookies = await signIn(t.app, 'super@test.fr')

    await grantAccess({
      userId: superAdmin.id,
      establishmentId: est.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    await testDb.establishment.update({
      where: { id: est.id },
      data: { deactivatedAt: new Date() },
    })

    const me = await t.app.inject({ method: 'GET', url: '/me', cookies })
    expect(me.statusCode).toBe(200)
    expect(
      (me.json().establishments as { id: string }[]).some(
        (e) => e.id === est.id,
      ),
    ).toBe(false)

    const tenant = await t.app.inject({
      method: 'GET',
      url: tenantUrl(est.id, service.id, '/patient'),
      cookies,
    })
    expect(tenant.statusCode).toBe(404)
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
        {
          id: est.id,
          services: [{ id: serviceA.id, role: 'COORDINATEUR' }],
          origine: 'reelle',
        },
      ],
    })
  })

  // Aucun test n'affirmait que
  // `/me` liste bien un établissement octroyé, alors que c'est le second des deux seuls
  // appelants de `effectiveMemberships` — la moitié de cette garantie n'était donc
  // vérifiée par rien.
  it('/me liste un etablissement octroye, avec son origine', async () => {
    const est = await createEstablishment('Octroi')
    const service = await createService(est.id, 'Service')
    const superAdmin = await createUser({
      email: 'super@test.fr',
      isSuperAdmin: true,
    })
    const cookies = await signIn(t.app, 'super@test.fr')

    await grantAccess({
      userId: superAdmin.id,
      establishmentId: est.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })

    const res = await t.app.inject({ method: 'GET', url: '/me', cookies })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      establishments: [
        {
          id: est.id,
          name: est.name,
          role: 'ADMIN',
          origine: 'octroi',
          services: [{ id: service.id, role: 'COORDINATEUR' }],
        },
      ],
    })
  })
})
