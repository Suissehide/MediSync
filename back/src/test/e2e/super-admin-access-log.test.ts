import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import { createEstablishment, createService, createUser, signIn } from './setup/fixtures'

// Tache 6, etape 4b : `GET /super-admin/access-log`. Ferme deux trous laisses par l'etape
// precedente (taches 1 a 5) -- voir le commentaire de tete de
// interfaces/http/fastify/routes/super-admin/access-log.ts pour le detail.
//
// DEUX ETABLISSEMENTS REELLEMENT PEUPLES, PAS UN SEUL (tour de correction 1, tache 5 -- lecon
// tiree par la revue de cette tache-la : une fixture a un seul etablissement laissait les 234
// tests e2e verts quand on retirait la borne d'etablissement d'une lecture voisine). Cette route
// lit a l'echelle de la PLATEFORME entiere : sans un second etablissement reellement peuple, rien
// ne distinguerait « la route ignore le filtre d'etablissement » de « il n'y a qu'un
// etablissement de toute facon ».
describe('GET /super-admin/access-log', () => {
  let testApp: TestApp
  let etabA: { id: string }
  let etabB: { id: string }
  let serviceA: { id: string }
  let serviceB: { id: string }
  let compte: { id: string }
  let cookiesSuperAdmin: { access_token: string }
  let cookiesAdminOrdinaire: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()

    etabA = await createEstablishment('Etablissement A')
    etabB = await createEstablishment('Etablissement B')
    serviceA = await createService(etabA.id, 'Service A')
    serviceB = await createService(etabB.id, 'Service B')

    const patientA = await testDb.patient.create({
      data: {
        firstName: 'Prenom-A-Confidentiel',
        lastName: 'Nom-A-Confidentiel',
        createDate: new Date(),
        establishmentId: etabA.id,
      },
    })
    const patientB = await testDb.patient.create({
      data: {
        firstName: 'Prenom-B-Confidentiel',
        lastName: 'Nom-B-Confidentiel',
        createDate: new Date(),
        establishmentId: etabB.id,
      },
    })

    // Les lignes du journal des CONSULTATIONS, sur les DEUX etablissements -- ecrites
    // directement en base plutot que rejouees via le crochet (deja eprouve par
    // patient-access-log.test.ts), une par etablissement, avec un compte et une action
    // distincts pour eprouver les trois filtres.
    await testDb.patientAccessLog.createMany({
      data: [
        {
          establishmentId: etabA.id,
          serviceId: serviceA.id,
          patientId: patientA.id,
          userID: 'u-coordinateur-a',
          userFirstName: 'Ada',
          userLastName: 'DuServiceA',
          action: 'dossier.ouvert',
          accesParOctroi: false,
        },
        {
          establishmentId: etabB.id,
          serviceId: serviceB.id,
          patientId: patientB.id,
          userID: 'u-coordinateur-b',
          userFirstName: 'Belle',
          userLastName: 'DuServiceB',
          action: 'export',
          accesParOctroi: false,
        },
      ],
    })

    // Le compte cible du script d'amorcage (`UserDomain.bootstrapSuperAdmin`) : la ligne
    // qu'aucune autre route ne peut lire, celle que cette tache rend enfin lisible.
    compte = await createUser({ email: 'promu-super-admin@test.fr', isSuperAdmin: true })
    await testDb.activityLog.create({
      data: {
        userID: 'cli:bootstrap-super-admin',
        action: 'superAdmin.granted',
        entityType: 'user',
        entityID: compte.id,
      },
    })

    await createUser({ email: 'super@test.fr', isSuperAdmin: true })
    await createUser({
      email: 'admin-ordinaire@test.fr',
      memberships: [{ establishmentId: etabA.id, role: 'ADMIN' }],
    })

    cookiesSuperAdmin = await signIn(testApp.app, 'super@test.fr')
    cookiesAdminOrdinaire = await signIn(testApp.app, 'admin-ordinaire@test.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  // Etape 1 du brief (task-6-brief.md), inchange : la ligne du script d'amorcage, qu'aucune
  // autre route ne peut lire (verifie par balayage sur /super-admin dans
  // super-admin-acces.test.ts, et par construction ici : ni la route d'etablissement -- qui
  // exige un `establishmentId` precis, absent sur cette ligne -- ni aucune route de tenant --
  // qui n'existe que sous un tenant -- ne peuvent l'atteindre).
  it('rend les lignes du script d amorcage, que nulle autre route ne peut lire', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=activite',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(
      res.json().some((l: { userID: string }) => l.userID === 'cli:bootstrap-super-admin'),
    ).toBe(true)
  })

  it('repond 404 a un compte sans le drapeau, jamais 403', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log',
      cookies: cookiesAdminOrdinaire,
    })
    expect(res.statusCode).toBe(404)
  })

  // Le second trou que cette tache ferme : AUCUNE route ne lisait `PatientAccessLog` a
  // l'echelle de la plateforme avant cette tache. Preuve directe : les DEUX etablissements
  // apparaissent, sans filtre.
  //
  // SABORDAGE ETROIT (etape 4, brief), EPROUVE PAR EXECUTION PUIS REVERTE AVANT CE COMMIT :
  // retirer l'entree `PatientAccessLog` de `SUPERADMIN_OPERATIONS` (tenant-guard.ts) fait
  // rougir CE test (et les trois suivants, qui partagent le meme `source=acces`) avec un 500
  // (`TenantScopeMissingError`, absorbe par le gestionnaire d'erreurs Fastify) -- jamais une
  // liste vide : le garde-fou refuse la lecture AVANT MEME D'ATTEINDRE LA BASE, exactement
  // comme documente sur `PatientAccessLogRepository.findAllPlatformWide`. Les deux tests
  // `source=activite`/404 ci-dessus restent verts sous ce sabordage (ils n'atteignent jamais
  // `PatientAccessLog`) -- c'est ce qui prouve que le refus vient bien de la declaration
  // manquante pour CE modele, pas d'une panne plus large du prefixe /super-admin.
  it('source=acces rend les acces des DEUX etablissements, sans filtre', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(new Set(res.json().map((l: { establishmentId: string }) => l.establishmentId))).toEqual(
      new Set([etabA.id, etabB.id]),
    )
  })

  it('filtre par etablissement', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/super-admin/access-log?source=acces&establishmentId=${etabA.id}`,
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { establishmentId: string }[]
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.establishmentId === etabA.id)).toBe(true)
  })

  it('filtre par compte (userID)', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces&userID=u-coordinateur-b',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { userID: string }[]
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.userID === 'u-coordinateur-b')).toBe(true)
  })

  it('filtre par action', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces&action=export',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { action: string }[]
    expect(body.length).toBeGreaterThan(0)
    expect(body.every((l) => l.action === 'export')).toBe(true)
  })

  // Arbitrage de l'etape 4a, non rouvert ici (voir le brief) : le super-admin compte les
  // patients, il ne les lit pas. Cette route ne rend donc jamais une IDENTITE de patient --
  // seulement un identifiant (`patientId`). Verifie par recherche de sous-chaine sur le corps
  // BRUT (meme double verification que superAdminUser.schema.ts, accountSearchResponseSchema),
  // en plus de la cle exacte : un nom de patient qui fuiterait sous une cle imprevue serait
  // invisible a une assertion qui ne regarderait que les cles connues.
  it('ne rend jamais d identite de patient — seulement des identifiants', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/super-admin/access-log?source=acces',
      cookies: cookiesSuperAdmin,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('Prenom-A-Confidentiel')
    expect(res.body).not.toContain('Nom-A-Confidentiel')
    expect(res.body).not.toContain('Prenom-B-Confidentiel')
    expect(res.body).not.toContain('Nom-B-Confidentiel')
    const body = res.json() as { patientId: string | null }[]
    expect(body.some((l) => typeof l.patientId === 'string' && l.patientId.length > 0)).toBe(true)
  })
})
