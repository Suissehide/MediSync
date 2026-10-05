import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createService,
  createUser,
  grantAccess,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }
type MeEstablishment = {
  id: string
  services: { id: string; name: string; role: string }[]
}

// Ne fige QUE `Date` : les vrais minuteurs (setTimeout, l'E/S de la vraie base de test) restent
// réels, seule l'horloge que lit `resolveTenant` est sous contrôle — ce qui rend l'expiration
// d'un octroi éprouvable sans attendre (même convention que tenant-resolution.test.ts).
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

// Le second service — ce qui rend enfin démontrable, à l'écran, le
// cloisonnement par service (design §1). Trois décisions y sont éprouvées : créer un service y rattache son créateur,
// comme COORDINATEUR (§3.2) ; désactiver avertit plutôt que d'exiger un transfert, et réactiver
// rend tout (§3.6) ; et un service désactivé sous les pieds d'un membre —
// ne doit plus servir sa requête suivante, sans révéler plus qu'un tenant inconnu (404).
describe('routes services', () => {
  let testApp: TestApp
  let adminCookies: Cookies
  let establishmentId: string

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('Etablissement services')
    establishmentId = establishment.id
    await createUser({
      email: 'admin-services@b.fr',
      memberships: [{ establishmentId, role: 'ADMIN' }],
    })
    testApp = await buildTestApp()
    adminCookies = await signIn(testApp.app, 'admin-services@b.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const call = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: unknown,
    cookies: Cookies = adminCookies,
  ) =>
    testApp.app.inject({
      method,
      url: adminUrl(establishmentId, `/services${url}`),
      cookies,
      payload: payload as never,
    })

  const meServices = async (cookies: Cookies) => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/me',
      cookies,
    })
    expect(res.statusCode).toBe(200)
    const establishment = (res.json().establishments as MeEstablishment[]).find(
      (e) => e.id === establishmentId,
    )
    return establishment?.services ?? []
  }

  // Créer un service y rattache son créateur, comme COORDINATEUR (spec §3.2). Le motif
  // (pourquoi ce n'est pas un accès de plus) vit dans le domaine (`ServiceDomain.create`) et dans
  // la spécification, pas ici — ce test éprouve seulement que le rattachement a bien lieu.
  it('cree un service et y rattache son createur comme coordinateur, visible depuis /me', async () => {
    const created = await call('POST', '/', { name: 'Cardiologie' })
    expect(created.statusCode).toBe(201)
    const service = created.json()
    expect(service.name).toBe('Cardiologie')
    expect(service.deactivatedAt).toBeNull()

    const services = await meServices(adminCookies)
    expect(services).toContainEqual({
      id: service.id,
      name: 'Cardiologie',
      role: 'COORDINATEUR',
      soignantId: null,
      affecte: true,
    })
  })

  // Sous un octroi temporaire (spec §4.3),
  // l'acteur est un membre ordinaire au sens des permissions, mais AUCUNE appartenance réelle
  // n'est jamais matérialisée. Créer un service ne doit donc PAS échouer faute d'appartenance à
  // rattacher, et ne doit PAS non plus en créer une — l'octroi donne déjà accès à tous les
  // services actifs de l'établissement, un rattachement réel survivrait à son expiration.
  it('un super-admin sous octroi cree un service SANS rattachement reel, et y accede quand meme', async () => {
    const superAdmin = await createUser({
      email: 'super-services@test.fr',
      isSuperAdmin: true,
    })
    await grantAccess({
      userId: superAdmin.id,
      establishmentId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    const superCookies = await signIn(testApp.app, 'super-services@test.fr')

    const created = await call('POST', '/', { name: 'Octroi' }, superCookies)
    expect(created.statusCode).toBe(201)
    const service = created.json()

    // Aucune EstablishmentMembership réelle n'a été créée pour cet acteur.
    const membership = await testDb.establishmentMembership.findFirst({
      where: { userId: superAdmin.id, establishmentId },
    })
    expect(membership).toBeNull()

    // Et pourtant l'accès fonctionne : l'octroi confère COORDINATEUR sur chaque service actif
    // de l'établissement (spec §3.5), y compris celui qui vient d'être créé — les services sont
    // relus frais à chaque requête (`AccessGrantRepository.findForUser`), jamais figés au moment
    // de l'octroi.
    const acces = await testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, service.id, '/location'),
      cookies: superCookies,
    })
    expect(acces.statusCode).toBe(200)
  })

  // Le cœur de l'argument « pas de rattachement réel » est
  // l'expiration — sans elle, rien ne distingue ce choix d'un rattachement classique qui
  // survivrait de toute façon. L'horloge
  // est avancée plutôt qu'attendue (même convention que tenant-resolution.test.ts).
  it('apres expiration de l octroi, le service reste actif et visible de l etablissement, mais son createur recoit 404 partout', async () => {
    const superAdmin = await createUser({
      email: 'super-expire@test.fr',
      isSuperAdmin: true,
    })
    const superCookies = await signIn(testApp.app, 'super-expire@test.fr')
    const debut = new Date()
    await grantAccess({
      userId: superAdmin.id,
      establishmentId,
      expiresAt: new Date(debut.getTime() + 1000),
    })

    jest.useFakeTimers({ doNotFake: [...TIMERS_REELS] })
    try {
      jest.setSystemTime(debut)

      const created = await call('POST', '/', { name: 'Expire' }, superCookies)
      expect(created.statusCode).toBe(201)
      const service = created.json()

      // L'octroi est expire depuis une seconde, sur le MEME cookie de session.
      jest.setSystemTime(new Date(debut.getTime() + 2000))

      // Le createur perd l'acces PARTOUT : le service qu'il vient de creer (plus aucun octroi
      // pour l'atteindre), et /me ne liste plus l'etablissement pour lui.
      const apresService = await testApp.app.inject({
        method: 'GET',
        url: tenantUrl(establishmentId, service.id, '/location'),
        cookies: superCookies,
      })
      expect(apresService.statusCode).toBe(404)
      const meApres = await testApp.app.inject({
        method: 'GET',
        url: '/me',
        cookies: superCookies,
      })
      expect(
        (meApres.json().establishments as MeEstablishment[]).find(
          (e) => e.id === establishmentId,
        ),
      ).toBeUndefined()

      // Le service, lui, N'A PAS DISPARU : il reste actif, et visible de l'etablissement — par
      // un administrateur REEL, dont l'acces ne depend d'aucun octroi. C'est bien ce que visait
      // la decision « pas de rattachement reel » : rien ne devait survivre a l'octroi, sauf le
      // service lui-meme, qui n'est pas un rattachement.
      const liste = await call('GET', '/')
      expect(liste.statusCode).toBe(200)
      expect(liste.json()).toContainEqual(
        expect.objectContaining({
          id: service.id,
          name: 'Expire',
          deactivatedAt: null,
        }),
      )
    } finally {
      jest.useRealTimers()
    }
  })

  // Un super-admin qui est REELLEMENT membre (non-administrateur) d'un AUTRE
  // etablissement, et cree un service sous octroi ICI. Sans le filtre `establishmentId` dans
  // `ServiceRepository.create` (`findFirst({ where: { userId, establishmentId } })`), une
  // recherche par le seul `userId` aurait pu rattacher le service neuf a l'appartenance de
  // l'AUTRE etablissement — un rattachement PERMANENT et FAUX (mauvais etablissement), qui
  // aurait en outre survecu a l'expiration de l'octroi. La borne d'etablissement ferme ce cas.
  it('un super-admin membre non-administrateur d un AUTRE etablissement, sous octroi ici, ne pollue ni son appartenance reelle ni celle-ci', async () => {
    const ailleurs = await createEstablishment('Ailleurs (services)')
    const superAdmin = await createUser({
      email: 'super-ailleurs@test.fr',
      isSuperAdmin: true,
      memberships: [{ establishmentId: ailleurs.id, role: 'MEMBER' }],
    })
    const membershipAilleursAvant =
      await testDb.establishmentMembership.findFirstOrThrow({
        where: { userId: superAdmin.id, establishmentId: ailleurs.id },
      })
    await grantAccess({
      userId: superAdmin.id,
      establishmentId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    const superCookies = await signIn(testApp.app, 'super-ailleurs@test.fr')

    const created = await call(
      'POST',
      '/',
      { name: 'Ailleurs-octroi' },
      superCookies,
    )
    expect(created.statusCode).toBe(201)

    // Aucune appartenance reelle creee sur l'etablissement CIBLE.
    expect(
      await testDb.establishmentMembership.findFirst({
        where: { userId: superAdmin.id, establishmentId },
      }),
    ).toBeNull()
    // Et l'appartenance REELLE, sur l'AUTRE etablissement, n'a recu aucun rattachement de
    // service parasite.
    expect(
      await testDb.serviceMembership.findMany({
        where: { establishmentMembershipId: membershipAilleursAvant.id },
      }),
    ).toEqual([])
  })

  it('refuse deux services de meme nom dans le meme etablissement', async () => {
    await call('POST', '/', { name: 'Doublon' })
    const second = await call('POST', '/', { name: 'Doublon' })
    expect(second.statusCode).toBe(409)
  })

  // Les compteurs de la désactivation (spec §3.6). Le second compte
  // (`suivisNullePartAilleurs`) est celui qui importe : trois patients suivis dans le service
  // évalué, dont deux le sont AUSSI dans un autre service du même établissement — seul le
  // troisième deviendrait invisible de toutes les listes. Un jeu où les deux comptes
  // coïncideraient (tous suivis ailleurs, ou aucun) ne prouverait rien.
  it('compte les dossiers qui deviendraient invisibles, pas seulement les dossiers', async () => {
    const serviceA = (await call('POST', '/', { name: 'A-impact' })).json()
    const serviceB = (await call('POST', '/', { name: 'B-impact' })).json()

    const createPatient = () =>
      testDb.patient.create({
        data: {
          firstName: 'Patient',
          lastName: `Impact-${Math.random()}`,
          createDate: new Date(),
          establishmentId,
        },
      })
    const p1 = await createPatient()
    const p2 = await createPatient()
    const p3 = await createPatient()
    for (const p of [p1, p2, p3]) {
      await testDb.patientServiceFile.create({
        data: { patientId: p.id, serviceId: serviceA.id, establishmentId },
      })
    }
    // p1 et p2 sont AUSSI suivis dans B : ils ne deviendraient pas invisibles si A était
    // désactivé. p3 n'est suivi qu'en A : lui seul compte dans suivisNullePartAilleurs.
    await testDb.patientServiceFile.create({
      data: { patientId: p1.id, serviceId: serviceB.id, establishmentId },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: p2.id, serviceId: serviceB.id, establishmentId },
    })

    const res = await call('GET', `/${serviceA.id}/impact-desactivation`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ suivisIci: 3, suivisNullePartAilleurs: 1 })

    // B, lui, ne suit que deux patients, tous deux suivis ailleurs (en A) : aucun ne deviendrait
    // invisible. Vérifié dans la foulée pour prouver que le compte n'est pas un total global
    // (qui serait identique des deux côtés) mais bien propre à CHAQUE service.
    const resB = await call('GET', `/${serviceB.id}/impact-desactivation`)
    expect(resB.json()).toEqual({ suivisIci: 2, suivisNullePartAilleurs: 0 })
  })

  // Un patient dont le SEUL autre
  // sous-dossier vit dans un service DÉJÀ désactivé deviendra tout aussi invisible qu'un
  // patient qui n'a aucun autre sous-dossier — l'équivalence promise par la spec §3.6 (« suivi
  // nulle part ailleurs = deviendra invisible ») exige donc de ne compter comme « ailleurs » que
  // les services encore ACTIFS.
  it('compte comme invisible un patient dont le seul autre suivi vit dans un service deja desactive', async () => {
    const serviceC = (await call('POST', '/', { name: 'C-impact' })).json()
    const serviceD = (
      await call('POST', '/', { name: 'D-impact-desactive' })
    ).json()

    const patient = await testDb.patient.create({
      data: {
        firstName: 'Patient',
        lastName: `Impact-desactive-${Math.random()}`,
        createDate: new Date(),
        establishmentId,
      },
    })
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceC.id, establishmentId },
    })
    // Le seul « ailleurs » de ce patient est le service D — désactivé AVANT même de mesurer
    // l'impact de C : D ne protège donc plus personne de l'invisibilité.
    await testDb.patientServiceFile.create({
      data: { patientId: patient.id, serviceId: serviceD.id, establishmentId },
    })
    const offD = await call('PATCH', `/${serviceD.id}`, { deactivated: true })
    expect(offD.statusCode).toBe(200)

    const res = await call('GET', `/${serviceC.id}/impact-desactivation`)
    expect(res.statusCode).toBe(200)
    // Sans le correctif : { suivisIci: 1, suivisNullePartAilleurs: 0 } — le patient compterait
    // à tort comme protégé par un service qui ne le montre déjà plus à personne.
    expect(res.json()).toEqual({ suivisIci: 1, suivisNullePartAilleurs: 1 })
  })

  it('rend deux zeros pour un service sans aucun patient', async () => {
    const serviceVide = (await call('POST', '/', { name: 'Vide' })).json()
    const res = await call('GET', `/${serviceVide.id}/impact-desactivation`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ suivisIci: 0, suivisNullePartAilleurs: 0 })
  })

  it('rend 404 (jamais les compteurs) pour un service d un autre etablissement', async () => {
    const autre = await createEstablishment('Autre etablissement')
    const serviceEtranger = await createService(autre.id, 'Etranger')

    expect(
      (await call('GET', `/${serviceEtranger.id}/impact-desactivation`))
        .statusCode,
    ).toBe(404)
    expect(
      (await call('PATCH', `/${serviceEtranger.id}`, { name: 'Vole' }))
        .statusCode,
    ).toBe(404)
  })

  describe('desactivation sous les pieds d un membre et reactivation', () => {
    let serviceD: { id: string; name: string }
    let cookiesD: Cookies
    let patientId: string
    let serviceFileId: string
    let serviceFilePath: string

    beforeAll(async () => {
      serviceD = (await call('POST', '/', { name: 'D-focus' })).json()
      await createUser({
        email: 'membre-d@b.fr',
        memberships: [
          {
            establishmentId,
            services: [{ serviceId: serviceD.id, role: 'LECTURE' }],
          },
        ],
      })
      cookiesD = await signIn(testApp.app, 'membre-d@b.fr')

      const patient = await testDb.patient.create({
        data: {
          firstName: 'Dos',
          lastName: 'Sier',
          createDate: new Date(),
          establishmentId,
        },
      })
      patientId = patient.id
      const serviceFile = await testDb.patientServiceFile.create({
        data: {
          patientId,
          serviceId: serviceD.id,
          establishmentId,
          followUpToDo: 'a-regulariser',
        },
      })
      serviceFileId = serviceFile.id
      serviceFilePath = tenantUrl(
        establishmentId,
        serviceD.id,
        `/patient/${patientId}/service-file`,
      )
    })

    it('un membre voit son dossier et son service tant que le service est actif', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: serviceFilePath,
        cookies: cookiesD,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe(serviceFileId)
      expect(res.json().followUpToDo).toBe('a-regulariser')

      expect(await meServices(cookiesD)).toContainEqual({
        id: serviceD.id,
        name: 'D-focus',
        role: 'LECTURE',
        soignantId: null,
        affecte: true,
      })
    })

    it(
      'desactive sous les pieds du membre : sa requete suivante n est plus servie, et ne ' +
        'revele rien de plus qu un tenant inconnu',
      async () => {
        const off = await call('PATCH', `/${serviceD.id}`, {
          deactivated: true,
        })
        expect(off.statusCode).toBe(200)
        expect(off.json().deactivatedAt).not.toBeNull()

        const apres = await testApp.app.inject({
          method: 'GET',
          url: serviceFilePath,
          cookies: cookiesD,
        })
        expect(apres.statusCode).toBe(404)

        // Un service désactivé et un service qui n'a jamais existé rendent EXACTEMENT la même
        // réponse : rien, dans le statut ou le corps, ne dit lequel des deux s'est produit.
        const inconnu = tenantUrl(
          establishmentId,
          'cnotaservicexxxxxxxxxxxxx',
          `/patient/${patientId}/service-file`,
        )
        const surTenantInconnu = await testApp.app.inject({
          method: 'GET',
          url: inconnu,
          cookies: cookiesD,
        })
        expect(apres.statusCode).toBe(surTenantInconnu.statusCode)
        expect(apres.json()).toEqual(surTenantInconnu.json())

        // /me ne le liste plus non plus : le membre n'a, de son point de vue, plus ce service.
        expect(
          (await meServices(cookiesD)).find((s) => s.id === serviceD.id),
        ).toBeUndefined()
      },
    )

    // Réactiver rend tout. Sans cette preuve, la décision « avertir plutôt qu'exiger un
    // transfert » (§3.6) ne serait pas acceptable — un dossier invisible sans retour possible
    // serait une perte, pas un avertissement.
    it('reactive : le dossier ET le membre sont de retour, sans rien avoir ete recree', async () => {
      const on = await call('PATCH', `/${serviceD.id}`, {
        deactivated: false,
      })
      expect(on.statusCode).toBe(200)
      expect(on.json().deactivatedAt).toBeNull()

      const retour = await testApp.app.inject({
        method: 'GET',
        url: serviceFilePath,
        cookies: cookiesD,
      })
      expect(retour.statusCode).toBe(200)
      // Même identifiant qu'avant désactivation : le sous-dossier est RENDU, pas recréé.
      expect(retour.json().id).toBe(serviceFileId)
      expect(retour.json().followUpToDo).toBe('a-regulariser')

      expect(await meServices(cookiesD)).toContainEqual({
        id: serviceD.id,
        name: 'D-focus',
        role: 'LECTURE',
        soignantId: null,
        affecte: true,
      })
    })

    it('un role de service sans role ADMIN d etablissement n atteint pas les routes de service', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: adminUrl(establishmentId, '/services'),
        cookies: cookiesD,
      })
      expect(res.statusCode).toBe(404)
    })
  })
  // ---------------------------------------------------------------------
  // Les identifiants que la MIGRATION du socle fabrique elle-meme.
  // ---------------------------------------------------------------------
  //
  // `20260922144905_multi_tenant_socle` cree l'etablissement et le service
  // d'origine avec des identifiants de la forme `est_<20 hex>` / `svc_<20 hex>`
  // (lignes 209-213 de sa migration), pour reprendre les donnees d'avant le
  // multi-tenant. Ce ne sont PAS des cuid. Toute reponse qui valide ces
  // identifiants avec `z.cuid()` echoue donc a la serialisation et rend 500 —
  // sur l'etablissement d'origine, c'est-a-dire en production.
  //
  // Constate en vrai sur la base de developpement : `GET /admin/services`
  // rendait 500 en boucle, et le front relancait la requete sans fin jusqu'a
  // « Maximum update depth exceeded ».
  describe('identifiants fabriques par la migration du socle', () => {
    it('rend 200 sur un service dont l identifiant vient de la migration, pas un cuid', async () => {
      const etab = await testDb.establishment.create({
        data: { id: `est_${'a1b2c3d4e5f6a7b8c9d0'}`, name: 'Etablissement' },
      })
      const svc = await testDb.service.create({
        data: {
          id: `svc_${'0d9c8b7a6f5e4d3c2b1a'}`,
          establishmentId: etab.id,
          name: 'Service',
        },
      })
      const admin = await createUser({
        email: 'admin-migration-lecture@b.fr',
        memberships: [{ establishmentId: etab.id, role: 'ADMIN' }],
      })
      const cookies = await signIn(testApp.app, admin.email)

      const res = await testApp.app.inject({
        method: 'GET',
        url: adminUrl(etab.id, '/services'),
        cookies,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().map((s: { id: string }) => s.id)).toContain(svc.id)
    })

    it('accepte d affecter un membre a un service dont l identifiant vient de la migration', async () => {
      const etab = await testDb.establishment.create({
        data: { id: `est_${'b1c2d3e4f5a6b7c8d9e0'}`, name: 'Etablissement' },
      })
      const svc = await testDb.service.create({
        data: {
          id: `svc_${'1e0d9c8b7a6f5e4d3c2b'}`,
          establishmentId: etab.id,
          name: 'Service',
        },
      })
      const admin = await createUser({
        email: 'admin-migration-affectation@b.fr',
        memberships: [{ establishmentId: etab.id, role: 'ADMIN' }],
      })
      const cible = await createUser({ email: 'cible-migration@b.fr' })
      const cookies = await signIn(testApp.app, admin.email)

      const res = await testApp.app.inject({
        method: 'POST',
        url: adminUrl(etab.id, '/members/account'),
        cookies,
        payload: {
          email: cible.email,
          role: 'MEMBER',
          services: [{ serviceId: svc.id, role: 'INTERVENANT' }],
        },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json().member.serviceMemberships).toEqual([
        { serviceId: svc.id, role: 'INTERVENANT' },
      ])
    })
  })
})
