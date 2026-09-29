// Tâche 7 (étape 4a) : la liste des établissements et ses compteurs (spec §3.3), le détail d'un
// établissement — services, membres, journal d'activité (spec §6.2, tour de correction 1) — et
// la recherche d'un compte (spec §3.4) — l'écran qui répond à « untel ne voit plus ses
// patients ».
//
// Property centrale (task-7-brief.md, Steps 1 et 3) : ces réponses ne portent JAMAIS de donnée
// de patient — ni son IDENTITÉ, ni le CONTENU de son dossier (diagnostic, notes, détails). Prouvé
// DEUX fois, comme à l'étape 3 : les clés EXACTES (`Object.keys(...).sort()`), puis une recherche
// de sous-chaîne sur le corps BRUT ENTIER — pas seulement sur une ligne.
//
// LEÇON DE CE FICHIER, ÉCRITE ICI PARCE QUE C'EST LA TROISIÈME FOIS QU'ELLE COÛTE UN TOUR (tour
// de correction 2) : le filet a manqué trois fois, JAMAIS par erreur de raisonnement — par
// PAUVRETÉ DU JEU D'ESSAI.
//   1. Une ligne fantôme nommée du patient, ajoutée AILLEURS dans un tableau, laissait toutes
//      les assertions de clés/valeurs vertes tant que la sous-chaîne n'était vérifiée que sur la
//      ligne examinée. → vérifier le corps ENTIER, jamais une ligne isolée.
//   2. Retirer le filtre d'établissement sur `patientCount` restait invisible tant que le jeu
//      d'essai ne créait de patients QUE dans l'établissement testé : le total global et le
//      total local coïncidaient alors par construction. → un établissement de contrôle,
//      créé une fois pour tout le fichier, avec des patients qu'AUCUN test ne doit jamais voir
//      compter ailleurs que chez lui.
//   3. Les marqueurs de sous-chaîne ne couvraient que des NOMS : un diagnostic médical glissé
//      dans un champ du journal aurait traversé tout. → un dossier clinique rempli
//      (`PatientServiceFile`), et des marqueurs qui couvrent aussi le CONTENU.
// Ne pas répéter cette leçon : tout nouvel établissement de test qui manipule un patient doit
// avoir au moins un dossier clinique rempli, et toute vérification de sous-chaîne doit courir
// sur le corps ENTIER de la réponse, jamais sur une valeur ou une ligne isolée.
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
} from './setup/fixtures'

type ListRow = { id: string; [key: string]: unknown }

const createPatient = (
  establishmentId: string,
  firstName: string,
  lastName: string,
) =>
  testDb.patient.create({
    data: { establishmentId, firstName, lastName, createDate: new Date() },
  })

// Un dossier clinique rempli (spec §5, `PatientServiceFile`) — le CONTENU dont la fuite ne se
// verrait que par sous-chaîne sur le corps entier, jamais par une clé (aucune route de ce
// fichier n'a de raison de déclarer un champ clinique, donc rien ne l'affirmerait par sa forme).
const createClinicalRecord = (params: {
  establishmentId: string
  serviceId: string
  patientId: string
  medicalDiagnosis: string
  notes: string
  details: string
}) =>
  testDb.patientServiceFile.create({
    data: {
      establishmentId: params.establishmentId,
      serviceId: params.serviceId,
      patientId: params.patientId,
      medicalDiagnosis: params.medicalDiagnosis,
      notes: params.notes,
      details: params.details,
    },
  })

const deactivateService = (id: string) =>
  testDb.service.update({ where: { id }, data: { deactivatedAt: new Date() } })

const deactivateUser = (id: string) =>
  testDb.user.update({ where: { id }, data: { deactivatedAt: new Date() } })

const setName = (id: string, firstName: string, lastName: string) =>
  testDb.user.update({ where: { id }, data: { firstName, lastName } })

const createActivityLogEntry = (
  establishmentId: string,
  params: {
    action: string
    entityID: string
    userID?: string
    createdAt?: Date
  },
) =>
  testDb.activityLog.create({
    data: {
      establishmentId,
      serviceId: null,
      userID: params.userID ?? 'staff-fixture-id',
      userFirstName: 'Prenom',
      userLastName: 'ActeurJournal',
      action: params.action,
      entityType: 'Patient',
      entityID: params.entityID,
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    },
  })

const findRow = (body: ListRow[], id: string) =>
  body.find((row) => row.id === id)

describe('consultation super-admin : liste des etablissements et recherche d un compte', () => {
  let testApp: TestApp
  let superAdminCookies: { access_token: string }

  beforeAll(async () => {
    await truncateAll()
    testApp = await buildTestApp()
    await createUser({
      email: 'super-consultation@medisync.fr',
      isSuperAdmin: true,
    })
    superAdminCookies = await signIn(
      testApp.app,
      'super-consultation@medisync.fr',
    )

    // Établissement de CONTRÔLE (leçon n°2 ci-dessus) : ses patients ne doivent JAMAIS apparaître
    // dans le compteur d'un autre établissement. Sa seule raison d'être est de garantir que le
    // total GLOBAL de patients diffère TOUJOURS du total LOCAL d'un établissement sous test — une
    // fixture où les deux coïncident ne prouve aucun filtre.
    const controlEstablishment = await createEstablishment(
      'Etablissement Controle Comptage',
    )
    for (let i = 0; i < 5; i += 1) {
      await createPatient(
        controlEstablishment.id,
        `PrenomControleGlobal${i}`,
        `NomControleGlobal${i}`,
      )
    }
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

  // Step 1 (task-7-brief.md) : le contenu exact de la liste, et ses compteurs.
  describe('GET /super-admin/establishments', () => {
    it(
      'affiche les cles EXACTES et les bons compteurs — serviceCount/accountCount ne comptent ' +
        "QUE l'utilisable (tour de correction 1), firstAdmin est le premier ENCORE actif avec " +
        'son nom (tour de correction 2), et aucune identite de patient dans le corps brut',
      async () => {
        const est = await createEstablishment('Etablissement Alpha Liste')
        await createService(est.id, 'Service Alpha 1')
        await createService(est.id, 'Service Alpha 2')
        const serviceDesactive = await createService(
          est.id,
          'Service Alpha Desactive',
        )
        await deactivateService(serviceDesactive.id)

        // Premier administrateur, chronologiquement — mais desactive depuis.
        const admin1 = await createUser({
          email: 'admin1-liste@alpha.fr',
          memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
        })
        await deactivateUser(admin1.id)

        // Second administrateur — celui que la liste doit montrer, avec son nom.
        const admin2 = await createUser({
          email: 'admin2-liste@alpha.fr',
          memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
        })
        await setName(admin2.id, 'Jeanne', 'Dupont')

        // Un compte simple, actif : compte dans `accountCount`, jamais dans `firstAdmin`.
        await createUser({
          email: 'membre-liste@alpha.fr',
          memberships: [{ establishmentId: est.id, role: 'MEMBER' }],
        })

        await createPatient(
          est.id,
          'PrenomSecretPatientAlphaUn',
          'NomSecretPatientAlphaUn',
        )
        await createPatient(
          est.id,
          'PrenomSecretPatientAlphaDeux',
          'NomSecretPatientAlphaDeux',
        )

        // Leçon n°2 : le total global (établissement de contrôle + ceux des tests précédents +
        // les 2 d'ici) est TOUJOURS strictement supérieur au total local (2) — un `patientCount`
        // sans filtre serait donc visible ici.
        const globalPatientCount = await testDb.patient.count()
        expect(globalPatientCount).toBeGreaterThan(2)

        const res = await listEstablishments()
        expect(res.statusCode).toBe(200)
        const body = res.json()
        const row = findRow(body, est.id)
        expect(row).toBeDefined()

        // Clés EXACTES — pas seulement l'absence de quelques champs (Step 1).
        expect(Object.keys(row).sort()).toEqual([
          'accountCount',
          'createdAt',
          'deactivatedAt',
          'firstAdmin',
          'id',
          'lastActivityAt',
          'name',
          'patientCount',
          'serviceCount',
        ])
        expect(Object.keys(row.firstAdmin as object).sort()).toEqual([
          'email',
          'firstName',
          'id',
          'lastName',
        ])

        expect(row.name).toBe('Etablissement Alpha Liste')
        expect(row.deactivatedAt).toBeNull()
        // 3 services crees, 1 desactive : seuls les 2 utilisables comptent.
        expect(row.serviceCount).toBe(2)
        // 3 comptes rattaches (admin1, admin2, membre), 1 desactive (admin1) : 2 utilisables.
        expect(row.accountCount).toBe(2)
        // Filtre par etablissement (leçon n°2) : 2, jamais le total global.
        expect(row.patientCount).toBe(2)
        expect(row.firstAdmin).toEqual({
          id: admin2.id,
          email: 'admin2-liste@alpha.fr',
          firstName: 'Jeanne',
          lastName: 'Dupont',
        })
        // Aucune ligne de journal pour cet etablissement : « jamais » se voit par `null`.
        expect(row.lastActivityAt).toBeNull()

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
      await deactivateUser(seulAdmin.id)

      const res = await listEstablishments()
      const row = findRow(res.json(), est.id)
      expect(row?.firstAdmin).toBeNull()
    })

    // Mineur (tour de correction 1), refait au tour 2 : le relecteur a montré que ma première
    // tentative échouait parce que l'ordre PHYSIQUE des lignes coïncidait avec l'ordre par
    // identifiant — Postgres, sans ORDER BY explicite sur `userId`, rend un scan dans l'ordre
    // d'insertion pour une table fraîchement écrite. En insérant D'ABORD la ligne du plus GRAND
    // identifiant, l'ordre physique et l'ordre voulu (userId croissant) DIVERGENT : le test
    // devient sensible au départage.
    it('firstAdmin est deterministe quand deux administrateurs partagent le meme instant de rattachement', async () => {
      const est = await createEstablishment('Etablissement Egalite Admin')
      const adminX = await createUser({ email: 'admin-egalite-x@egalite.fr' })
      const adminY = await createUser({ email: 'admin-egalite-y@egalite.fr' })
      const [smallerAdmin, largerAdmin] =
        adminX.id < adminY.id ? [adminX, adminY] : [adminY, adminX]
      const sameInstant = new Date()

      // Insere D'ABORD la ligne du plus grand identifiant.
      await testDb.establishmentMembership.create({
        data: {
          userId: largerAdmin.id,
          establishmentId: est.id,
          role: 'ADMIN',
          createdAt: sameInstant,
        },
      })
      await testDb.establishmentMembership.create({
        data: {
          userId: smallerAdmin.id,
          establishmentId: est.id,
          role: 'ADMIN',
          createdAt: sameInstant,
        },
      })

      const res = await listEstablishments()
      const row = findRow(res.json(), est.id)
      // Avec le departage (userId croissant), c'est le plus PETIT identifiant qui gagne — jamais
      // celui insere en premier.
      expect((row?.firstAdmin as { id: string } | null)?.id).toBe(
        smallerAdmin.id,
      )
    })

    // Tour de correction 1, Important n°3 : la regression precise que la revue a demontree —
    // une connexion, meme PARTAGEE entre deux etablissements, ne doit plus faire bouger AUCUN
    // des deux. Seule une vraie ligne de journal, DANS un etablissement, fait bouger CELUI-LA.
    it(
      "lastActivityAt vient du journal d'activite de CET etablissement — une connexion, meme " +
        'partagee entre deux etablissements, ne le fait bouger dans AUCUN des deux',
      async () => {
        const estE = await createEstablishment('Etablissement Epsilon Activite')
        const estF = await createEstablishment('Etablissement Zeta Activite')

        await createUser({
          email: 'membre-partage-activite@epsilon-zeta.fr',
          memberships: [
            { establishmentId: estE.id, role: 'MEMBER' },
            { establishmentId: estF.id, role: 'MEMBER' },
          ],
        })

        const before = await listEstablishments()
        expect(findRow(before.json(), estE.id)?.lastActivityAt).toBeNull()
        expect(findRow(before.json(), estF.id)?.lastActivityAt).toBeNull()

        await signIn(testApp.app, 'membre-partage-activite@epsilon-zeta.fr')

        const afterSignIn = await listEstablishments()
        expect(findRow(afterSignIn.json(), estE.id)?.lastActivityAt).toBeNull()
        expect(findRow(afterSignIn.json(), estF.id)?.lastActivityAt).toBeNull()

        const activityDate = new Date()
        await createActivityLogEntry(estE.id, {
          action: 'patient.updated',
          entityID: 'patient-fixture-epsilon',
          createdAt: activityDate,
        })

        const afterActivity = await listEstablishments()
        const rowE = findRow(afterActivity.json(), estE.id)
        const rowF = findRow(afterActivity.json(), estF.id)
        expect(rowE?.lastActivityAt).not.toBeNull()
        expect(new Date(rowE?.lastActivityAt as string).getTime()).toBe(
          activityDate.getTime(),
        )
        // L'autre etablissement, jamais touche par l'activite, reste `null`.
        expect(rowF?.lastActivityAt).toBeNull()
      },
    )
  })

  describe('GET /super-admin/establishments/:id', () => {
    it(
      'rend les cles EXACTES du detail entier — etablissement, services, membres, journal — ' +
        'avec un etablissement qui A des patients (dont un dossier CLINIQUE rempli), des ' +
        'services (actifs et desactives) et des lignes de journal, et ni identite ni contenu ' +
        'de patient nulle part dans le corps brut',
      async () => {
        const est = await createEstablishment('Etablissement Detail Complet')
        const serviceActif = await createService(est.id, 'Service Detail Actif')
        const serviceInactif = await createService(
          est.id,
          'Service Detail Inactif',
        )
        await deactivateService(serviceInactif.id)

        const admin = await createUser({
          email: 'admin-detail@detail.fr',
          memberships: [{ establishmentId: est.id, role: 'ADMIN' }],
        })
        await setName(admin.id, 'Alice', 'Admin')
        const membre = await createUser({
          email: 'membre-detail@detail.fr',
          memberships: [{ establishmentId: est.id, role: 'MEMBER' }],
        })
        await setName(membre.id, 'Bob', 'Membre')
        await deactivateUser(membre.id)

        const patient1 = await createPatient(
          est.id,
          'PrenomSecretDetailUn',
          'NomSecretDetailUn',
        )
        await createPatient(
          est.id,
          'PrenomSecretDetailDeux',
          'NomSecretDetailDeux',
        )

        // Leçon n°3 : un dossier clinique REMPLI, dont le contenu (pas seulement l'identité du
        // patient) doit être couvert par la vérification de sous-chaîne ci-dessous.
        await createClinicalRecord({
          establishmentId: est.id,
          serviceId: serviceActif.id,
          patientId: patient1.id,
          medicalDiagnosis: 'DiagnosticConfidentielDetailXYZ',
          notes: 'NotesConfidentiellesDetailXYZ',
          details: 'DetailsConfidentielsDetailXYZ',
        })

        await createActivityLogEntry(est.id, {
          action: 'patient.updated',
          entityID: 'entite-journal-un',
          userID: admin.id,
        })
        await createActivityLogEntry(est.id, {
          action: 'patient.created',
          entityID: 'entite-journal-deux',
          userID: admin.id,
        })

        const res = await getEstablishment(est.id)
        expect(res.statusCode).toBe(200)
        const body = res.json()

        // Clés EXACTES du corps ENTIER — pas seulement de la ligne (tour de correction 1).
        expect(Object.keys(body).sort()).toEqual([
          'accountCount',
          'activityLog',
          'createdAt',
          'deactivatedAt',
          'firstAdmin',
          'id',
          'lastActivityAt',
          'members',
          'name',
          'patientCount',
          'serviceCount',
          'services',
        ])

        expect(body.services).toHaveLength(2)
        for (const service of body.services) {
          expect(Object.keys(service).sort()).toEqual([
            'createdAt',
            'deactivatedAt',
            'id',
            'name',
          ])
        }
        expect(body.services).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: serviceActif.id,
              name: 'Service Detail Actif',
              deactivatedAt: null,
            }),
            expect.objectContaining({
              id: serviceInactif.id,
              name: 'Service Detail Inactif',
            }),
          ]),
        )
        expect(
          body.services.find((s: { id: string }) => s.id === serviceInactif.id)
            .deactivatedAt,
        ).not.toBeNull()

        expect(body.members).toHaveLength(2)
        for (const member of body.members) {
          expect(Object.keys(member).sort()).toEqual([
            'createdAt',
            'deactivatedAt',
            'email',
            'firstName',
            'id',
            'lastName',
            'role',
          ])
        }
        expect(body.members).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: admin.id,
              email: 'admin-detail@detail.fr',
              firstName: 'Alice',
              lastName: 'Admin',
              role: 'ADMIN',
              deactivatedAt: null,
            }),
            expect.objectContaining({
              id: membre.id,
              email: 'membre-detail@detail.fr',
              firstName: 'Bob',
              lastName: 'Membre',
              role: 'MEMBER',
            }),
          ]),
        )
        expect(
          body.members.find((m: { id: string }) => m.id === membre.id)
            .deactivatedAt,
        ).not.toBeNull()

        // serviceCount/accountCount ne comptent que l'utilisable — meme regle que la liste.
        expect(body.serviceCount).toBe(1)
        expect(body.accountCount).toBe(1)
        // patientCount filtre par etablissement (leçon n°2) : 2, jamais le total global (qui
        // inclut l'etablissement de controle et tous les patients des autres tests).
        const globalPatientCount = await testDb.patient.count()
        expect(globalPatientCount).toBeGreaterThan(2)
        expect(body.patientCount).toBe(2)

        expect(body.activityLog).toHaveLength(2)
        for (const entry of body.activityLog) {
          expect(Object.keys(entry).sort()).toEqual([
            'action',
            'createdAt',
            'entityID',
            'entityType',
            'id',
            'userFirstName',
            'userID',
            'userLastName',
          ])
        }
        expect(body.activityLog).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: 'patient.updated',
              entityID: 'entite-journal-un',
            }),
            expect.objectContaining({
              action: 'patient.created',
              entityID: 'entite-journal-deux',
            }),
          ]),
        )

        // Double vérification sur le corps ENTIER (toutes les lignes, pas seulement la
        // première) — précisément ce que la revue a montré absent : une ligne fantôme nommée du
        // patient, ailleurs dans un tableau, échappait à toute assertion de clé/valeur ci-dessus.
        // IDENTITÉ :
        expect(res.payload).not.toContain('PrenomSecretDetailUn')
        expect(res.payload).not.toContain('NomSecretDetailUn')
        expect(res.payload).not.toContain('PrenomSecretDetailDeux')
        expect(res.payload).not.toContain('NomSecretDetailDeux')
        // CONTENU du dossier (leçon n°3) — diagnostic, notes, détails :
        expect(res.payload).not.toContain('DiagnosticConfidentielDetailXYZ')
        expect(res.payload).not.toContain('NotesConfidentiellesDetailXYZ')
        expect(res.payload).not.toContain('DetailsConfidentielsDetailXYZ')
      },
    )

    it('rend 404 pour un identifiant inconnu', async () => {
      const res = await getEstablishment('clzzzzzzzzzzzzzzzzzzzzzzz')
      expect(res.statusCode).toBe(404)
    })
  })

  // Step 3 (task-7-brief.md) : la recherche d'un compte — rattachements, rôles, désactivations
  // et dernier accès. Aucune donnée de patient.
  describe('GET /super-admin/users?email=', () => {
    it(
      'rend les cles EXACTES du compte (avec son nom, tour de correction 2) et de chaque ' +
        "rattachement, avec le role et le nom de l'etablissement, et aucune identite de " +
        'patient dans le corps brut',
      async () => {
        const estGamma = await createEstablishment(
          'Etablissement Gamma Recherche',
        )
        const estDelta = await createEstablishment(
          'Etablissement Delta Recherche',
        )

        const account = await createUser({
          email: 'compte-cherche@recherche.fr',
          memberships: [{ establishmentId: estGamma.id, role: 'ADMIN' }],
        })
        await setName(account.id, 'Claire', 'Cherche')
        // Second rattachement, ajouté après coup — un compte peut appartenir à plusieurs
        // établissements.
        await testDb.establishmentMembership.create({
          data: {
            userId: account.id,
            establishmentId: estDelta.id,
            role: 'MEMBER',
          },
        })

        await createPatient(
          estGamma.id,
          'PrenomSecretRechercheUn',
          'NomSecretRechercheUn',
        )

        const res = await searchAccount('compte-cherche@recherche.fr')
        expect(res.statusCode).toBe(200)
        const body = res.json()

        expect(Object.keys(body).sort()).toEqual([
          'deactivatedAt',
          'email',
          'firstName',
          'id',
          'lastLoginAt',
          'lastName',
          'memberships',
        ])
        expect(body.id).toBe(account.id)
        expect(body.email).toBe('compte-cherche@recherche.fr')
        expect(body.firstName).toBe('Claire')
        expect(body.lastName).toBe('Cherche')
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
      const account = await createUser({
        email: 'compte-desactive-recherche@recherche.fr',
      })
      await signIn(testApp.app, 'compte-desactive-recherche@recherche.fr')
      await deactivateUser(account.id)

      const res = await searchAccount('compte-desactive-recherche@recherche.fr')
      const body = res.json()
      expect(body.deactivatedAt).not.toBeNull()
      expect(body.lastLoginAt).not.toBeNull()
    })

    // Mineur (tour de correction 1) : le message ne doit pas parler d'« ID » pour une recherche
    // par ADRESSE — le message générique de l'error handler ('User with this ID doesn't exist')
    // est trompeur ici, seul endroit du fichier où il pouvait atteindre un appelant HTTP.
    it("rend 404 pour une adresse inconnue, avec un message qui parle d'adresse, pas d'ID", async () => {
      const res = await searchAccount('jamais-vu-recherche@nulle-part.fr')
      expect(res.statusCode).toBe(404)
      expect(res.json().message).not.toMatch(/\bID\b/)
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
      const before = await testDb.user.findUniqueOrThrow({
        where: { id: user.id },
      })
      expect(before.lastLoginAt).toBeNull()

      await signIn(testApp.app, 'connexion-lastlogin@test.fr')

      const after = await testDb.user.findUniqueOrThrow({
        where: { id: user.id },
      })
      expect(after.lastLoginAt).not.toBeNull()
      expect(after.lastLoginAt?.getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('se met a jour a CHAQUE connexion reussie, pas seulement la premiere', async () => {
      const user = await createUser({
        email: 'connexion-lastlogin-deux@test.fr',
      })
      await signIn(testApp.app, 'connexion-lastlogin-deux@test.fr')
      const first = await testDb.user.findUniqueOrThrow({
        where: { id: user.id },
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      await signIn(testApp.app, 'connexion-lastlogin-deux@test.fr')
      const second = await testDb.user.findUniqueOrThrow({
        where: { id: user.id },
      })

      expect(first.lastLoginAt).not.toBeNull()
      expect(second.lastLoginAt).not.toBeNull()
      expect(second.lastLoginAt?.getTime()).toBeGreaterThan(
        first.lastLoginAt?.getTime() ?? 0,
      )
    })

    it("n'est PAS pose par une tentative de connexion en echec (mot de passe errone)", async () => {
      const user = await createUser({
        email: 'connexion-echec-lastlogin@test.fr',
      })

      const res = await testApp.app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: {
          email: 'connexion-echec-lastlogin@test.fr',
          password: 'mauvais-mot-de-passe',
        },
      })
      expect(res.statusCode).toBe(401)

      const after = await testDb.user.findUniqueOrThrow({
        where: { id: user.id },
      })
      expect(after.lastLoginAt).toBeNull()
    })
  })
})
