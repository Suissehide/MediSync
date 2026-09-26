// Tâche 7 (étape 4a) : la liste des établissements et ses compteurs (spec §3.3), et la
// recherche d'un compte (spec §3.4) — l'écran qui répond à « untel ne voit plus ses patients ».
//
// Property centrale (task-7-brief.md, Steps 1 et 3) : ces deux réponses ne portent JAMAIS de
// donnée de patient, même sous forme d'identité. Prouvé DEUX fois, comme à l'étape 3 : les clés
// EXACTES de la réponse (`Object.keys(...).sort()`), puis une recherche de sous-chaîne sur le
// corps BRUT — la clé seule laisserait passer un champ imbriqué qui porterait la valeur.
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createEstablishment, createService, createUser, signIn } from './setup/fixtures'

describe('consultation super-admin : liste des etablissements et recherche d un compte', () => {
  let testApp: TestApp
  let superAdminCookies: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
    await createUser({ email: 'super-consultation@medisync.fr', isSuperAdmin: true })
    superAdminCookies = await signIn(testApp.app, 'super-consultation@medisync.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const listEstablishments = () =>
    testApp.app.inject({
      method: 'GET',
      url: '/super-admin/establishments',
      cookies: superAdminCookies,
    })

  const getEstablishment = (id: string) =>
    testApp.app.inject({
      method: 'GET',
      url: `/super-admin/establishments/${id}`,
      cookies: superAdminCookies,
    })

  const searchAccount = (email: string) =>
    testApp.app.inject({
      method: 'GET',
      url: `/super-admin/users?email=${encodeURIComponent(email)}`,
      cookies: superAdminCookies,
    })

  const createPatient = (establishmentId: string, firstName: string, lastName: string) =>
    testDb.patient.create({
      data: { establishmentId, firstName, lastName, createDate: new Date() },
    })

  // Step 1 (task-7-brief.md) : le contenu exact de la liste, et ses compteurs.
  describe('GET /super-admin/establishments', () => {
    it(
      "affiche les cles EXACTES et les bons compteurs — le premier administrateur ENCORE " +
        "actif (le tout premier a ete desactive), et aucune identite de patient dans le corps brut",
      async () => {
        const est = await createEstablishment('Etablissement Alpha Liste')
        await createService(est.id, 'Service Alpha 1')
        await createService(est.id, 'Service Alpha 2')

        // Premier administrateur, chronologiquement — mais desactive depuis.
        const admin1 = await createUser({
          email: 'admin1-liste@alpha.fr',
          memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
        })
        await testDb.user.update({
          where: { id: admin1.id },
          data: { deactivatedAt: new Date() },
        })

        // Second administrateur — celui que la liste doit montrer.
        const admin2 = await createUser({
          email: 'admin2-liste@alpha.fr',
          memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
        })

        // Un compte simple : compte dans `accountCount`, jamais dans `firstAdmin`.
        await createUser({
          email: 'membre-liste@alpha.fr',
          memberships: [{ establishmentId: est.id, role: 'MEMBER' }],
        })

        await createPatient(est.id, 'PrenomSecretPatientAlphaUn', 'NomSecretPatientAlphaUn')
        await createPatient(est.id, 'PrenomSecretPatientAlphaDeux', 'NomSecretPatientAlphaDeux')

        const res = await listEstablishments()
        expect(res.statusCode).toBe(200)
        const body = res.json()
        const row = body.find((e: { id: string }) => e.id === est.id)
        expect(row).toBeDefined()

        // Clés EXACTES — pas seulement l'absence de quelques champs (Step 1).
        expect(Object.keys(row).sort()).toEqual([
          'accountCount',
          'createdAt',
          'deactivatedAt',
          'firstAdmin',
          'id',
          'lastAccessAt',
          'name',
          'patientCount',
          'serviceCount',
        ])

        expect(row.name).toBe('Etablissement Alpha Liste')
        expect(row.deactivatedAt).toBeNull()
        expect(row.serviceCount).toBe(2)
        expect(row.accountCount).toBe(3)
        expect(row.patientCount).toBe(2)
        expect(row.firstAdmin).toEqual({ id: admin2.id, email: 'admin2-liste@alpha.fr' })
        // Personne ne s'est encore connecté : « jamais ».
        expect(row.lastAccessAt).toBeNull()

        // Double vérification (Step 1) : aucune identité de patient dans le corps BRUT.
        expect(res.payload).not.toContain('PrenomSecretPatientAlphaUn')
        expect(res.payload).not.toContain('NomSecretPatientAlphaUn')
        expect(res.payload).not.toContain('PrenomSecretPatientAlphaDeux')
        expect(res.payload).not.toContain('NomSecretPatientAlphaDeux')
      },
    )

    it("firstAdmin est null quand l'etablissement n'a plus AUCUN administrateur actif", async () => {
      const est = await createEstablishment('Etablissement Beta Sans Admin')
      const seulAdmin = await createUser({
        email: 'seul-admin-beta@beta.fr',
        memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
      })
      await testDb.user.update({
        where: { id: seulAdmin.id },
        data: { deactivatedAt: new Date() },
      })

      const res = await listEstablishments()
      const row = res.json().find((e: { id: string }) => e.id === est.id)
      expect(row.firstAdmin).toBeNull()
    })

    it("lastAccessAt reflete une connexion reelle, posee par le chemin de connexion (step 4)", async () => {
      const est = await createEstablishment('Etablissement Alpha Connexion')
      await createUser({
        email: 'admin-connexion@alpha-connexion.fr',
        memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
      })

      const before = await listEstablishments()
      const rowBefore = before.json().find((e: { id: string }) => e.id === est.id)
      expect(rowBefore.lastAccessAt).toBeNull()

      await signIn(testApp.app, 'admin-connexion@alpha-connexion.fr')

      const after = await listEstablishments()
      const rowAfter = after.json().find((e: { id: string }) => e.id === est.id)
      expect(rowAfter.lastAccessAt).not.toBeNull()
      expect(new Date(rowAfter.lastAccessAt).getTime()).toBeGreaterThan(Date.now() - 5000)
    })
  })

  describe('GET /super-admin/establishments/:id', () => {
    it("rend le detail d'un etablissement, meme forme que la liste", async () => {
      const est = await createEstablishment('Etablissement Detail')
      await createService(est.id, 'Service Detail 1')

      const res = await getEstablishment(est.id)
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(Object.keys(body).sort()).toEqual([
        'accountCount',
        'createdAt',
        'deactivatedAt',
        'firstAdmin',
        'id',
        'lastAccessAt',
        'name',
        'patientCount',
        'serviceCount',
      ])
      expect(body.id).toBe(est.id)
      expect(body.serviceCount).toBe(1)
    })

    it('rend 404 pour un identifiant inconnu', async () => {
      const res = await getEstablishment('clzzzzzzzzzzzzzzzzzzzzzzz')
      expect(res.statusCode).toBe(404)
    })
  })

  // Step 3 (task-7-brief.md) : la recherche d'un compte — rattachements, rôles, désactivations
  // et dernier accès. Aucune donnée de patient.
  describe('GET /super-admin/users?email=', () => {
    it(
      "rend les cles EXACTES du compte et de chaque rattachement, avec le role et le nom de " +
        "l'etablissement, et aucune identite de patient dans le corps brut",
      async () => {
        const estGamma = await createEstablishment('Etablissement Gamma Recherche')
        const estDelta = await createEstablishment('Etablissement Delta Recherche')

        const account = await createUser({
          email: 'compte-cherche@recherche.fr',
          memberships: [{ establishmentId: estGamma.id, role: 'ADMIN' }],
        })
        // Second rattachement, ajouté après coup — un compte peut appartenir à plusieurs
        // établissements.
        await testDb.establishmentMembership.create({
          data: { userId: account.id, establishmentId: estDelta.id, role: 'MEMBER' },
        })

        await createPatient(estGamma.id, 'PrenomSecretRechercheUn', 'NomSecretRechercheUn')

        const res = await searchAccount('compte-cherche@recherche.fr')
        expect(res.statusCode).toBe(200)
        const body = res.json()

        expect(Object.keys(body).sort()).toEqual([
          'deactivatedAt',
          'email',
          'id',
          'lastLoginAt',
          'memberships',
        ])
        expect(body.id).toBe(account.id)
        expect(body.email).toBe('compte-cherche@recherche.fr')
        expect(body.deactivatedAt).toBeNull()
        expect(body.lastLoginAt).toBeNull()
        expect(body.memberships).toHaveLength(2)
        for (const membership of body.memberships) {
          expect(Object.keys(membership).sort()).toEqual([
            'createdAt',
            'establishmentId',
            'establishmentName',
            'role',
          ])
        }
        expect(body.memberships).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              establishmentId: estGamma.id,
              establishmentName: 'Etablissement Gamma Recherche',
              role: 'ADMIN',
            }),
            expect.objectContaining({
              establishmentId: estDelta.id,
              establishmentName: 'Etablissement Delta Recherche',
              role: 'MEMBER',
            }),
          ]),
        )

        // Double vérification (Step 3, même exigence qu'au Step 1) : aucune identité de patient
        // dans le corps BRUT — même nichée dans un champ par ailleurs permis.
        expect(res.payload).not.toContain('PrenomSecretRechercheUn')
        expect(res.payload).not.toContain('NomSecretRechercheUn')
      },
    )

    it('montre la desactivation et le dernier acces du compte cherche', async () => {
      const account = await createUser({ email: 'compte-desactive-recherche@recherche.fr' })
      await signIn(testApp.app, 'compte-desactive-recherche@recherche.fr')
      await testDb.user.update({
        where: { id: account.id },
        data: { deactivatedAt: new Date() },
      })

      const res = await searchAccount('compte-desactive-recherche@recherche.fr')
      const body = res.json()
      expect(body.deactivatedAt).not.toBeNull()
      expect(body.lastLoginAt).not.toBeNull()
    })

    it('rend 404 pour une adresse inconnue', async () => {
      const res = await searchAccount('jamais-vu-recherche@nulle-part.fr')
      expect(res.statusCode).toBe(404)
    })

    it('rend 400 quand la query email est absente', async () => {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/super-admin/users',
        cookies: superAdminCookies,
      })
      expect(res.statusCode).toBe(400)
    })
  })

  // Step 4 (task-7-brief.md) : la connexion pose `lastLoginAt` — sans quoi la liste ment en
  // affichant « jamais » pour tout le monde.
  describe('User.lastLoginAt est alimente a la connexion (auth.domain.ts#signIn)', () => {
    it('est null avant toute connexion, puis pose apres une connexion reussie', async () => {
      const user = await createUser({ email: 'connexion-lastlogin@test.fr' })
      const before = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(before.lastLoginAt).toBeNull()

      await signIn(testApp.app, 'connexion-lastlogin@test.fr')

      const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(after.lastLoginAt).not.toBeNull()
      expect(after.lastLoginAt?.getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('se met a jour a CHAQUE connexion reussie, pas seulement la premiere', async () => {
      const user = await createUser({ email: 'connexion-lastlogin-deux@test.fr' })
      await signIn(testApp.app, 'connexion-lastlogin-deux@test.fr')
      const first = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await signIn(testApp.app, 'connexion-lastlogin-deux@test.fr')
      const second = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })

      expect(first.lastLoginAt).not.toBeNull()
      expect(second.lastLoginAt).not.toBeNull()
      expect(second.lastLoginAt?.getTime()).toBeGreaterThan(first.lastLoginAt?.getTime() ?? 0)
    })

    it("n'est PAS pose par une tentative de connexion en echec (mot de passe errone)", async () => {
      const user = await createUser({ email: 'connexion-echec-lastlogin@test.fr' })

      const res = await testApp.app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: 'connexion-echec-lastlogin@test.fr', password: 'mauvais-mot-de-passe' },
      })
      expect(res.statusCode).toBe(401)

      const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } })
      expect(after.lastLoginAt).toBeNull()
    })
  })
})
