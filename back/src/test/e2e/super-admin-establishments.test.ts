import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createUser, signIn } from './setup/fixtures'

const NEW_PASSWORD = 'MotDePasseValideEtLong123!!'

describe('POST /super-admin/establishments', () => {
  let testApp: TestApp
  let superAdminCookies: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
    await createUser({ email: 'super@medisync.fr', isSuperAdmin: true })
    superAdminCookies = await signIn(testApp.app, 'super@medisync.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const create = (body: {
    name: string
    email: string
    firstName?: string
    lastName?: string
  }) =>
    testApp.app.inject({
      method: 'POST',
      url: '/super-admin/establishments',
      cookies: superAdminCookies,
      payload: body,
    })

  // Step 1 (task-6-brief.md) : le chemin complet. Créer un établissement avec le nom et
  // l'adresse d'un premier administrateur crée l'établissement, le compte, son rattachement en
  // ADMIN, et rend un lien — que l'on consomme ensuite pour se connecter, et `/me` montre bien
  // l'établissement créé.
  it("cree l'etablissement, le compte du premier administrateur, son rattachement ADMIN, et rend un lien qui permet de se connecter — /me montre l'etablissement", async () => {
    const res = await create({
      name: 'Clinique du Parc',
      email: 'premiere-admin@clinique.fr',
      firstName: 'Jeanne',
      lastName: 'Dupont',
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.establishment).toMatchObject({ name: 'Clinique du Parc' })
    expect(body.establishment.id).toEqual(expect.any(String))
    expect(body.firstAdmin).toMatchObject({
      email: 'premiere-admin@clinique.fr',
      firstName: 'Jeanne',
      lastName: 'Dupont',
    })
    expect(typeof body.accessLink.token).toBe('string')
    expect(body.accessLink.token.length).toBeGreaterThan(0)

    // Le rattachement en ADMIN existe bien en base, sur le nouvel établissement.
    const membership = await testDb.establishmentMembership.findFirst({
      where: {
        userId: body.firstAdmin.id,
        establishmentId: body.establishment.id,
      },
    })
    expect(membership?.role).toBe('ADMIN')

    // Le lien consomme permet de se connecter…
    const consume = await testApp.app.inject({
      method: 'POST',
      url: '/auth/access-link/consume',
      payload: { token: body.accessLink.token, password: NEW_PASSWORD },
    })
    expect(consume.statusCode).toBe(200)

    const newAdminCookies = await signIn(
      testApp.app,
      'premiere-admin@clinique.fr',
      NEW_PASSWORD,
    )

    // …et /me montre bien l'etablissement, avec le role ADMIN.
    const me = await testApp.app.inject({
      method: 'GET',
      url: '/me',
      cookies: newAdminCookies,
    })
    expect(me.statusCode).toBe(200)
    const meBody = me.json()
    expect(meBody.establishments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: body.establishment.id,
          name: 'Clinique du Parc',
          role: 'ADMIN',
        }),
      ]),
    )
  })

  // Step 2, Review Focus n°4 (task-6-brief.md) : une adresse deja connue. Trois exigences,
  // chacune sa propre assertion.
  describe('creer un etablissement avec l adresse d un compte deja existant', () => {
    it("le compte existant n'est PAS ecrase (ni le nom, ni le mot de passe)", async () => {
      const existing = await createUser({
        email: 'deja-connu@ailleurs.fr',
        password: 'MotDePasseOriginal123!!',
      })
      await testDb.user.update({
        where: { id: existing.id },
        data: { firstName: 'Original', lastName: 'Nom' },
      })
      const before = await testDb.user.findUniqueOrThrow({
        where: { id: existing.id },
      })

      const res = await create({
        name: 'Second Etablissement',
        email: 'deja-connu@ailleurs.fr',
        // Des valeurs DIFFERENTES de celles deja en base : si la route les appliquait, ce
        // serait un ecrasement — precisement ce que ce test refuse.
        firstName: 'Ecrase',
        lastName: 'ParErreur',
      })
      expect(res.statusCode).toBe(201)

      const after = await testDb.user.findUniqueOrThrow({
        where: { id: existing.id },
      })
      // Ni le nom…
      expect(after.firstName).toBe('Original')
      expect(after.lastName).toBe('Nom')
      // …ni le mot de passe (meme hash et sel qu'avant l'appel).
      expect(after.password).toBe(before.password)
      expect(after.salt).toBe(before.salt)
      // Le mot de passe ORIGINAL fonctionne toujours pour se connecter.
      await expect(
        signIn(testApp.app, 'deja-connu@ailleurs.fr', 'MotDePasseOriginal123!!'),
      ).resolves.toBeDefined()
    })

    it('le compte existant est bien rattache (ADMIN) au nouvel etablissement', async () => {
      const existing = await createUser({ email: 'rattache-moi@ailleurs.fr' })

      const res = await create({
        name: 'Troisieme Etablissement',
        email: 'rattache-moi@ailleurs.fr',
      })
      const body = res.json()

      const membership = await testDb.establishmentMembership.findFirst({
        where: {
          userId: existing.id,
          establishmentId: body.establishment.id,
        },
      })
      expect(membership?.role).toBe('ADMIN')
    })

    it("la reponse ne distingue pas un compte cree d'un compte reutilise", async () => {
      const nouveau = await create({
        name: 'Etablissement A',
        email: 'jamais-vu@ailleurs.fr',
      })
      await createUser({ email: 'deja-vu@ailleurs.fr' })
      const reutilise = await create({
        name: 'Etablissement B',
        email: 'deja-vu@ailleurs.fr',
      })

      expect(nouveau.statusCode).toBe(reutilise.statusCode)

      // Liste FERMEE des cles attendues (pas seulement « les deux reponses se ressemblent ») :
      // un champ supplementaire (« reused », « existed », un booleen quelconque) ferait
      // rougir CE test meme s'il portait la MEME cle des deux cotes avec des valeurs
      // differentes — ce qu'une simple comparaison nouveau/reutilise ne peut pas voir, puisque
      // le NOM de la cle serait identique dans les deux reponses (montre par sabotage : voir
      // task-6-report.md).
      const expectedTopLevelKeys = ['accessLink', 'establishment', 'firstAdmin'].sort()
      const expectedAdminKeys = ['email', 'firstName', 'id', 'lastName'].sort()
      for (const res of [nouveau, reutilise]) {
        const body = res.json()
        expect(Object.keys(body).sort()).toEqual(expectedTopLevelKeys)
        expect(Object.keys(body.firstAdmin).sort()).toEqual(expectedAdminKeys)
      }
    })
  })
})
