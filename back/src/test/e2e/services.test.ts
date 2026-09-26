import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  adminUrl,
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }
type MeEstablishment = {
  id: string
  services: { id: string; name: string; role: string }[]
}

// Tâche 9 (étape 4a) : le second service — ce qui rend enfin démontrable, à l'écran, le
// cloisonnement par service que trois étapes précédentes ont préparé sans pouvoir le vérifier
// (design §1). Trois décisions y sont éprouvées : créer un service y rattache son créateur,
// comme COORDINATEUR (§3.2) ; désactiver avertit plutôt que d'exiger un transfert, et réactiver
// rend tout (§3.6) ; et le Review Focus n°3 — un service désactivé sous les pieds d'un membre —
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
    const establishment = (
      res.json().establishments as MeEstablishment[]
    ).find((e) => e.id === establishmentId)
    return establishment?.services ?? []
  }

  // Step 1 : créer un service y rattache son créateur, comme COORDINATEUR (spec §3.2). Le motif
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
    })
  })

  it('refuse deux services de meme nom dans le meme etablissement', async () => {
    await call('POST', '/', { name: 'Doublon' })
    const second = await call('POST', '/', { name: 'Doublon' })
    expect(second.statusCode).toBe(409)
  })

  // Step 2 : les compteurs de la désactivation (spec §3.6). Le second compte
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

  describe('Review Focus n3 (desactivation sous les pieds d un membre) et reactivation', () => {
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

    // Step 4 : réactiver rend tout. Sans cette preuve, la décision « avertir plutôt qu'exiger un
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
})
