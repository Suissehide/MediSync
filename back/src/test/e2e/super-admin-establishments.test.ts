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

  // Le chemin complet. Créer un établissement avec le nom et
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
    expect(typeof body.accessLink.token).toBe('string')
    expect(body.accessLink.token.length).toBeGreaterThan(0)
    // La reponse ne porte AUCUNE information sur le
    // compte — seulement l'etablissement et le lien.
    expect(Object.keys(body).sort()).toEqual(['accessLink', 'establishment'])

    // Le compte a bien ete cree avec les prenom/nom SOUMIS (verifie en base, pas dans la
    // reponse).
    const createdAdmin = await testDb.user.findUniqueOrThrow({
      where: { email: 'premiere-admin@clinique.fr' },
    })
    expect(createdAdmin.firstName).toBe('Jeanne')
    expect(createdAdmin.lastName).toBe('Dupont')

    // Le rattachement en ADMIN existe bien en base, sur le nouvel établissement.
    const membership = await testDb.establishmentMembership.findFirst({
      where: {
        userId: createdAdmin.id,
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

  // Une adresse deja connue. Trois exigences, chacune sa propre assertion.
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
        signIn(
          testApp.app,
          'deja-connu@ailleurs.fr',
          'MotDePasseOriginal123!!',
        ),
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
      // le NOM de la cle serait identique dans les deux reponses. La reponse ne porte AUCUNE
      // information sur le compte : la liste attendue est reduite d'autant.
      const expectedTopLevelKeys = ['accessLink', 'establishment'].sort()
      for (const res of [nouveau, reutilise]) {
        expect(Object.keys(res.json()).sort()).toEqual(expectedTopLevelKeys)
      }
    })

    // Un appel avec un nom different sur une adresse DEJA connue
    // rendait l'ANCIEN nom stocke, jamais celui soumis, ce qu'une comparaison par NOM de cle ne
    // pouvait pas voir. Prouve ici en envoyant des noms differents et en verifiant qu'AUCUN des
    // deux (ni le stocke, ni le soumis) n'apparait nulle part dans le corps de la reponse — la
    // reponse ne doit rien dire sur le compte, dans un sens comme dans l'autre.
    it('ne revele jamais le prenom/nom — ni celui stocke, ni celui soumis — meme quand ils different', async () => {
      const existing = await createUser({ email: 'nom-stocke@ailleurs.fr' })
      await testDb.user.update({
        where: { id: existing.id },
        data: { firstName: 'Zorro', lastName: 'Stocke' },
      })

      const res = await create({
        name: 'Etablissement Oracle De Nom',
        email: 'nom-stocke@ailleurs.fr',
        firstName: 'Autre',
        lastName: 'Personne',
      })

      expect(res.statusCode).toBe(201)
      const raw = res.payload
      expect(raw).not.toContain('Zorro')
      expect(raw).not.toContain('Stocke')
      expect(raw).not.toContain('Autre')
      expect(raw).not.toContain('Personne')
      expect(Object.keys(res.json()).sort()).toEqual([
        'accessLink',
        'establishment',
      ])

      // Et le compte existant garde bien SON nom d'origine — pas celui soumis.
      const after = await testDb.user.findUniqueOrThrow({
        where: { id: existing.id },
      })
      expect(after.firstName).toBe('Zorro')
      expect(after.lastName).toBe('Stocke')
    })
  })

  // Un compte desactive ne peut ni se connecter ni consommer un lien
  // (AccessLinkDomain.consume). Le refus doit avoir lieu EN AMONT de toute
  // ecriture : aucun etablissement orphelin, inutilisable, cree en silence.
  it('refuse en amont un compte desactive : aucun etablissement ni rattachement n est cree', async () => {
    const deactivated = await createUser({ email: 'desactive@ailleurs.fr' })
    await testDb.user.update({
      where: { id: deactivated.id },
      data: { deactivatedAt: new Date() },
    })

    const res = await create({
      name: 'Etablissement Jamais Cree',
      email: 'desactive@ailleurs.fr',
    })

    expect(res.statusCode).toBe(409)
    const establishment = await testDb.establishment.findFirst({
      where: { name: 'Etablissement Jamais Cree' },
    })
    expect(establishment).toBeNull()
    const membership = await testDb.establishmentMembership.findFirst({
      where: { userId: deactivated.id },
    })
    expect(membership).toBeNull()
  })

  // Les trois ecritures (etablissement, compte, rattachement) PLUS l'emission du lien sont une
  // seule transaction. Prouve en faisant
  // echouer, tour a tour, la DEUXIEME ecriture (le rattachement) puis la TROISIEME etape
  // (l'emission du lien) — sur les VRAIS singletons de l'IoC (pas une reimplementation), pour
  // que l'echec traverse la VRAIE transaction plutot qu'une simulee.
  //
  // `mockRejectedValueOnce` remplace la methode entiere — elle ne s'execute donc JAMAIS, et le
  // sabotage ne peut rien ecrire avant
  // de rejeter. Un test construit ainsi est aveugle a la regression precise qu'il existe pour
  // empecher (omettre le client de transaction sur UN SEUL appel) : rien n'est ecrit hors
  // transaction de toute facon, puisque rien n'est ecrit du tout. On peut le demontrer :
  // en retirant `tx` du seul appel a `accessLinkDomain.issue`, `npm run build` reste vert et ces
  // deux tests aussi, alors que deux ecritures sortent silencieusement de la transaction sur la
  // branche du compte preexistant. Remplace par un PASSE-PLAT : appeler la VRAIE implementation
  // (capturee avant l'espionnage, donc jamais elle-meme espionnee), la laisser ECRIRE POUR DE
  // VRAI dans la transaction en cours, PUIS jeter — pour que ce soit l'ANNULATION, et non
  // l'absence d'ecriture, qui soit mise a l'epreuve.
  describe('annulation transactionnelle : un echec en cours de route n annule PAS que sa propre ecriture', () => {
    it("l'echec du rattachement (2e ecriture, APRES qu'elle ait reellement ecrit) annule tout, y compris le compte fraichement cree", async () => {
      const repo = testApp.instances.establishmentRepository
      const original = repo.attachAdmin.bind(repo)
      const spy = jest
        .spyOn(repo, 'attachAdmin')
        .mockImplementationOnce(async (establishmentId, userId, client) => {
          // Passe-plat : la VRAIE ecriture a bien lieu, dans la transaction en cours...
          await original(establishmentId, userId, client)
          // ...et C'EST SEULEMENT APRES qu'on simule l'echec, pour eprouver l'annulation d'une
          // ecriture reelle plutot que l'absence d'ecriture.
          throw new Error(
            'SABOTAGE: rattachement en echec, apres ecriture reelle',
          )
        })

      const res = await create({
        name: 'Etablissement Annule Rattachement',
        email: 'jamais-vu-annule-rattachement@ailleurs.fr',
      })
      spy.mockRestore()

      expect(res.statusCode).toBe(500)
      const establishment = await testDb.establishment.findFirst({
        where: { name: 'Etablissement Annule Rattachement' },
      })
      expect(establishment).toBeNull()
      const user = await testDb.user.findUnique({
        where: { email: 'jamais-vu-annule-rattachement@ailleurs.fr' },
      })
      expect(user).toBeNull()
      // Le rattachement lui-meme, ecrit reellement par le passe-plat avant l'echec, ne survit
      // pas non plus.
      const membership = await testDb.establishmentMembership.findFirst({
        where: { establishment: { name: 'Etablissement Annule Rattachement' } },
      })
      expect(membership).toBeNull()
    })

    it("l'echec de l'emission du lien (APRES qu'elle ait reellement ecrit) annule tout, y compris le rattachement", async () => {
      const domain = testApp.instances.accessLinkDomain
      const original = domain.issue.bind(domain)
      const spy = jest
        .spyOn(domain, 'issue')
        .mockImplementationOnce(async (userId, issuedBy, client) => {
          // Passe-plat : les VRAIES ecritures (invalidation + creation du lien) ont bien lieu,
          // dans la transaction en cours...
          await original(userId, issuedBy, client)
          // ...et C'EST SEULEMENT APRES qu'on simule l'echec.
          throw new Error('SABOTAGE: emission en echec, apres ecriture reelle')
        })

      const res = await create({
        name: 'Etablissement Annule Lien',
        email: 'jamais-vu-annule-lien@ailleurs.fr',
      })
      spy.mockRestore()

      expect(res.statusCode).toBe(500)
      const establishment = await testDb.establishment.findFirst({
        where: { name: 'Etablissement Annule Lien' },
      })
      expect(establishment).toBeNull()
      const user = await testDb.user.findUnique({
        where: { email: 'jamais-vu-annule-lien@ailleurs.fr' },
      })
      expect(user).toBeNull()
      // Aucun rattachement ne peut donc survivre non plus, faute d'etablissement ou de compte.
      const membership = await testDb.establishmentMembership.findFirst({
        where: { user: { email: 'jamais-vu-annule-lien@ailleurs.fr' } },
      })
      expect(membership).toBeNull()
      // Et le lien lui-meme, ecrit reellement par le passe-plat avant l'echec, ne survit pas.
      const accessLink = await testDb.accessLink.findFirst({
        where: { user: { email: 'jamais-vu-annule-lien@ailleurs.fr' } },
      })
      expect(accessLink).toBeNull()
    })
  })
})

describe('PATCH /super-admin/establishments/:id', () => {
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

  const rename = (id: string, name: string) =>
    testApp.app.inject({
      method: 'PATCH',
      url: `/super-admin/establishments/${id}`,
      cookies: superAdminCookies,
      payload: { name },
    })

  it("renomme l'etablissement", async () => {
    const { id } = await testDb.establishment.create({
      data: { name: 'Ancien nom' },
    })

    const res = await rename(id, '  Nouveau nom  ')

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id, name: 'Nouveau nom' })
    const stored = await testDb.establishment.findUniqueOrThrow({
      where: { id },
    })
    expect(stored.name).toBe('Nouveau nom')
  })

  it('refuse un nom vide (400) et un id inconnu (404)', async () => {
    const { id } = await testDb.establishment.create({ data: { name: 'X' } })
    expect((await rename(id, '   ')).statusCode).toBe(400)
    expect(
      (await rename('00000000-0000-0000-0000-000000000000', 'Y')).statusCode,
    ).toBe(404)
  })
})
