// Regle de robustesse de ce filet : on peut changer comment le test atteint
// la donnee, jamais ce qu'il affirme.
import { buildTestApp, type TestApp } from './setup/app'
import { testDb, truncateAll } from './setup/db'
import {
  createEstablishment,
  createService,
  createUser,
  signIn,
  tenantUrl,
} from './setup/fixtures'

type Cookies = { access_token: string }

// Ce filet couvre le deplacement de seize colonnes de parcours et de
// contenu clinique de la table Patient vers un sous-dossier par service,
// retirees de l'objet de validation du patient (patient.schema.ts) —
// Zod retire silencieusement les cles inconnues d'un corps de requete, donc
// l'ECRITURE de ces colonnes a change de route autant que leur LECTURE :
// toutes deux passent desormais par /patient/:id/service-file plutot que par
// /patient/:id. Ce que ce test affirme reste identique : les memes seize
// valeurs, ecrites puis relues, comparees une par une, pour chacun des deux
// patients.
describe('routes du patient', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceId: string
  let coordinateurCookies: Cookies

  const get = (url: string) =>
    testApp.app.inject({
      method: 'GET',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
    })

  const post = (url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'POST',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
      payload: payload as never,
    })

  const patch = (url: string, payload: unknown) =>
    testApp.app.inject({
      method: 'PATCH',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
      payload: payload as never,
    })

  const del = (url: string) =>
    testApp.app.inject({
      method: 'DELETE',
      url: tenantUrl(establishmentId, serviceId, url),
      cookies: coordinateurCookies,
    })

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E')
    establishmentId = establishment.id
    const service = await createService(establishmentId, 'S')
    serviceId = service.id

    // COORDINATEUR : seul role qui detient a la fois patient:write,
    // patient:delete et clinical:write, necessaires aux quatre scenarios
    // couverts ici.
    await createUser({
      email: 'coordinateur@patient.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [{ serviceId, role: 'COORDINATEUR' }],
        },
      ],
    })

    testApp = await buildTestApp()
    coordinateurCookies = await signIn(testApp.app, 'coordinateur@patient.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  it('cree deux patients, renseigne les seize colonnes de chacun avec des valeurs distinctes une par une, et verifie qu aucun des deux ne recupere une colonne de l autre', async () => {
    // Deux patients, jamais un seul : un filet a un seul patient ne peut pas
    // detecter un decalage entre patients (une migration qui mesattribuerait
    // les sous-dossiers par jointure positionnelle plutot que par
    // identifiant de patient le laisserait vert). Chaque valeur ci-dessous
    // porte le nom de son patient, pour que le diff d'un echec dise lui-meme
    // qui a recu la valeur de qui.
    const pierreCreated = await post('/patient', {
      firstName: 'Pierre',
      lastName: 'Durand',
    })
    expect(pierreCreated.statusCode).toBe(201)
    const pierreId = pierreCreated.json().id as string

    const catherineCreated = await post('/patient', {
      firstName: 'Catherine',
      lastName: 'Leroy',
    })
    expect(catherineCreated.statusCode).toBe(201)
    const catherineId = catherineCreated.json().id as string

    const pierreValues = {
      medicalDiagnosis: 'Pierre - Diabete de type 2',
      entryDate: '2026-03-01T00:00:00.000Z',
      careMode: 'Pierre - Ambulatoire',
      orientation: 'Pierre - Medecin traitant',
      etpDecision: 'Pierre - oui',
      programType: 'Pierre - ETP diabete',
      nonInclusionDetails: 'Pierre - Aucun motif de non-inclusion',
      customContentDetails: 'Pierre - Contenu personnalise du parcours',
      goal: "Pierre - Ameliorer l'equilibre alimentaire",
      exitDate: '2026-06-01T00:00:00.000Z',
      stopReason: 'Pierre - Programme termine normalement',
      etpFinalOutcome: 'Pierre - Objectifs atteints',
      referringCaregiver: 'Pierre - Dr Martin',
      followUpToDo: 'Pierre - Controle a 3 mois',
      notes: 'Pierre - NOTE-PATIENT',
      details: 'Pierre - DETAIL-PATIENT',
    }

    const catherineValues = {
      medicalDiagnosis: 'Catherine - Hypertension arterielle',
      entryDate: '2026-04-10T00:00:00.000Z',
      careMode: 'Catherine - Hospitalisation de jour',
      orientation: 'Catherine - Cardiologue',
      etpDecision: 'Catherine - non',
      programType: 'Catherine - ETP cardio',
      nonInclusionDetails: 'Catherine - Grossesse en cours',
      customContentDetails: 'Catherine - Contenu adapte au parcours cardio',
      goal: 'Catherine - Stabiliser la tension arterielle',
      exitDate: '2026-09-15T00:00:00.000Z',
      stopReason: 'Catherine - Deces',
      etpFinalOutcome: 'Catherine - Objectifs partiellement atteints',
      referringCaregiver: 'Catherine - Dr Bernard',
      followUpToDo: 'Catherine - Bilan sanguin de controle',
      notes: 'Catherine - NOTE-PATIENT',
      details: 'Catherine - DETAIL-PATIENT',
    }

    // Les seize colonnes vivent desormais sur le sous-dossier de service du
    // patient, plus sur le patient lui-meme : elles
    // s'ecrivent et se relisent donc sous /patient/:id/service-file plutot
    // que sous /patient/:id, en PATCH (une charge partielle y fait une mise
    // a jour partielle, pas un remplacement — voir la route). C'est le seul
    // changement autorise sur ce filet (voir l'en-tete du fichier) : les
    // seize valeurs, une fois ecrites, et les 32 assertions qui les relisent
    // plus bas restent identiques.
    const pierreUpdateRes = await patch(
      `/patient/${pierreId}/service-file`,
      pierreValues,
    )
    expect(pierreUpdateRes.statusCode).toBe(200)

    const catherineUpdateRes = await patch(
      `/patient/${catherineId}/service-file`,
      catherineValues,
    )
    expect(catherineUpdateRes.statusCode).toBe(200)

    const pierreFetched = (
      await get(`/patient/${pierreId}/service-file`)
    ).json()
    const catherineFetched = (
      await get(`/patient/${catherineId}/service-file`)
    ).json()

    // Les seize noms sont ecrits ici un par un, pour chaque patient : c'est
    // le compte etabli contre back/prisma/schema.prisma, et c'est
    // precisement la liste portee par le sous-dossier de service plutot que
    // par la table Patient. Chaque valeur attendue porte le nom du patient
    // auquel elle appartient : un echec dit donc lui-meme qui a recu la
    // valeur de qui.
    expect(pierreFetched.medicalDiagnosis).toBe(pierreValues.medicalDiagnosis)
    expect(new Date(pierreFetched.entryDate).toISOString()).toBe(
      pierreValues.entryDate,
    )
    expect(pierreFetched.careMode).toBe(pierreValues.careMode)
    expect(pierreFetched.orientation).toBe(pierreValues.orientation)
    expect(pierreFetched.etpDecision).toBe(pierreValues.etpDecision)
    expect(pierreFetched.programType).toBe(pierreValues.programType)
    expect(pierreFetched.nonInclusionDetails).toBe(
      pierreValues.nonInclusionDetails,
    )
    expect(pierreFetched.customContentDetails).toBe(
      pierreValues.customContentDetails,
    )
    expect(pierreFetched.goal).toBe(pierreValues.goal)
    expect(new Date(pierreFetched.exitDate).toISOString()).toBe(
      pierreValues.exitDate,
    )
    expect(pierreFetched.stopReason).toBe(pierreValues.stopReason)
    expect(pierreFetched.etpFinalOutcome).toBe(pierreValues.etpFinalOutcome)
    expect(pierreFetched.referringCaregiver).toBe(
      pierreValues.referringCaregiver,
    )
    expect(pierreFetched.followUpToDo).toBe(pierreValues.followUpToDo)
    expect(pierreFetched.notes).toBe(pierreValues.notes)
    expect(pierreFetched.details).toBe(pierreValues.details)

    expect(catherineFetched.medicalDiagnosis).toBe(
      catherineValues.medicalDiagnosis,
    )
    expect(new Date(catherineFetched.entryDate).toISOString()).toBe(
      catherineValues.entryDate,
    )
    expect(catherineFetched.careMode).toBe(catherineValues.careMode)
    expect(catherineFetched.orientation).toBe(catherineValues.orientation)
    expect(catherineFetched.etpDecision).toBe(catherineValues.etpDecision)
    expect(catherineFetched.programType).toBe(catherineValues.programType)
    expect(catherineFetched.nonInclusionDetails).toBe(
      catherineValues.nonInclusionDetails,
    )
    expect(catherineFetched.customContentDetails).toBe(
      catherineValues.customContentDetails,
    )
    expect(catherineFetched.goal).toBe(catherineValues.goal)
    expect(new Date(catherineFetched.exitDate).toISOString()).toBe(
      catherineValues.exitDate,
    )
    expect(catherineFetched.stopReason).toBe(catherineValues.stopReason)
    expect(catherineFetched.etpFinalOutcome).toBe(
      catherineValues.etpFinalOutcome,
    )
    expect(catherineFetched.referringCaregiver).toBe(
      catherineValues.referringCaregiver,
    )
    expect(catherineFetched.followUpToDo).toBe(catherineValues.followUpToDo)
    expect(catherineFetched.notes).toBe(catherineValues.notes)
    expect(catherineFetched.details).toBe(catherineValues.details)

    // Nettoyage : ne pas influencer le test de liste suivant.
    await testDb.patient.delete({ where: { id: pierreId } })
    await testDb.patient.delete({ where: { id: catherineId } })
  })

  it('refuse en 400 un corps qui porte un des seize champs de service, sur POST et PATCH /patient', async () => {
    // Les seize champs ont quitte patient.schema.ts pour
    // patientServiceFile.schema.ts ; sans `.strict()`, Zod les retirerait en
    // silence d'un corps de requete au lieu de les rejeter, et l'appelant
    // croirait avoir enregistre une saisie clinique qui n'a jamais ete
    // ecrite nulle part. Le front actuel envoie encore ces champs a chaque
    // enregistrement : ce 400 est le signal voulu en attendant que le front
    // s'aligne sur le nouveau schema.
    const createdWithClinical = await post('/patient', {
      firstName: 'Refuse',
      lastName: 'Creation',
      notes: 'PERDU-A-LA-CREATION',
    })
    expect(createdWithClinical.statusCode).toBe(400)

    const created = await post('/patient', {
      firstName: 'Refuse',
      lastName: 'Maj',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const updatedWithClinical = await patch(`/patient/${patientId}`, {
      firstName: 'Refuse',
      stopReason: 'PERDU-A-LA-MAJ',
    })
    expect(updatedWithClinical.statusCode).toBe(400)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('refuse en 400 un des seize champs de service glisse dans patientData, sur POST /patient/enroll', async () => {
    // Meme defaut qu'au-dessus, sur la route voisine : `patientData` de
    // `enrollPatientInPathwaysSchema` n'etait pas strict, donc un des seize
    // champs y survivait a Zod puis se faisait jeter en silence, sans
    // jamais atteindre le sous-dossier que la route cree pourtant
    // (task-5-re-review.md, point 2).
    const enrolledWithClinical = await post('/patient/enroll', {
      patientData: {
        firstName: 'Refuse',
        lastName: 'Enroll',
        notes: 'PERDU-VIA-ENROLL',
      },
      startDate: '2026-01-01T00:00:00.000Z',
      pathways: [{ tag: 'pathway-inexistant', timeOfDay: 'ALL_DAY' }],
    })
    expect(enrolledWithClinical.statusCode).toBe(400)

    expect(
      await testDb.patient.findFirst({ where: { lastName: 'Enroll' } }),
    ).toBeNull()
  })

  it('la liste des patients contient le patient cree', async () => {
    const created = await post('/patient', {
      firstName: 'Alice',
      lastName: 'Martin',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const list = (await get('/patient')).json() as { id: string }[]
    expect(list.map((p) => p.id)).toContain(patientId)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('la suppression retire le patient, son sous-dossier, ses diagnostics et ses problemes d inscription', async () => {
    const created = await post('/patient', {
      firstName: 'Paul',
      lastName: 'Durand',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    // Le diagnostic et le probleme d'inscription pointent vers le
    // sous-dossier de service du patient, pas directement vers le patient
    // (clef etrangere posee par la migration 20260924160131), et ce
    // sous-dossier n'existe pas encore pour un patient tout neuf. C'est
    // desormais le chemin applicatif lui-meme qui le cree — a la creation
    // d'un diagnostic et a l'inscription en parcours (voir
    // PatientServiceFileDomain.ensureExists, appele depuis
    // DiagnosticEducatifDomain.create et PatientDomain.processEnrollments)
    // — donc ce test passe par les deux routes reelles plutot que par un
    // `testDb.patientServiceFile.create` qui fabriquerait un etat que la
    // production ne sait pas produire : un tel contournement fabrique la
    // bonne alerte au mauvais endroit.
    const diagnosticRes = await post(`/patient/${patientId}/diagnostic`, {
      title: 'Diagnostic de test',
    })
    expect(diagnosticRes.statusCode).toBe(201)
    const diagnosticId = diagnosticRes.json().id as string

    const enrollRes = await post(`/patient/${patientId}/enroll`, {
      patientID: patientId,
      startDate: '2026-01-01T00:00:00.000Z',
      pathways: [{ tag: 'pathway-inexistant', timeOfDay: 'ALL_DAY' }],
    })
    expect(enrollRes.statusCode).toBe(200)
    const enrollmentIssue = await testDb.enrollmentIssue.findFirstOrThrow({
      where: { patientId },
    })

    const res = await del(`/patient/${patientId}`)
    expect(res.statusCode).toBe(204)

    expect(
      await testDb.patient.findUnique({ where: { id: patientId } }),
    ).toBeNull()
    expect(
      await testDb.patientServiceFile.findUnique({
        where: { patientId_serviceId: { patientId, serviceId } },
      }),
    ).toBeNull()
    expect(
      await testDb.diagnosticEducatif.findUnique({
        where: { id: diagnosticId },
      }),
    ).toBeNull()
    expect(
      await testDb.enrollmentIssue.findUnique({
        where: { id: enrollmentIssue.id },
      }),
    ).toBeNull()
  })

  it('l ecriture du sous-dossier journalise une entree patient.updated, comme le faisait PATCH /patient', async () => {
    const created = await post('/patient', {
      firstName: 'Jean',
      lastName: 'Journal',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    // Avant l'ecriture du sous-dossier : aucune entree pour ce patient.
    expect(
      await testDb.activityLog.count({
        where: { entityID: patientId, action: 'patient.updated' },
      }),
    ).toBe(0)

    const res = await patch(`/patient/${patientId}/service-file`, {
      medicalDiagnosis: 'DIAG-JOURNAL',
      notes: 'NOTES-JOURNAL',
      stopReason: 'MOTIF-JOURNAL',
    })
    expect(res.statusCode).toBe(200)

    // L'ecriture clinique doit laisser une trace, exactement comme le
    // faisait PATCH /patient/:id avant que ces colonnes ne demenagent :
    // sans cet evenement, le journal ne bouge jamais et l'assertion
    // ci-dessous resterait a 0 meme apres l'attente.
    // L'attente courte tient compte de la forme suivie (AppEventBus.emit
    // n'est pas attendu par le domaine, comme pour PATCH /patient/:id) :
    // ActivityLogSubscriber ecrit en arriere-plan, apres que la reponse
    // HTTP soit deja partie.
    let count = 0
    for (let attempt = 0; attempt < 20 && count < 1; attempt++) {
      count = await testDb.activityLog.count({
        where: { entityID: patientId, action: 'patient.updated' },
      })
      if (count < 1) {
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
    expect(count).toBe(1)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it("l'export Excel repond 200 avec un corps non vide", async () => {
    const created = await post('/patient', {
      firstName: 'Export',
      lastName: 'Test',
    })
    expect(created.statusCode).toBe(201)
    const patientId = created.json().id as string

    const res = await get('/patient/export')
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.length).toBeGreaterThan(0)

    await testDb.patient.delete({ where: { id: patientId } })
  })
})

// `GET /patient/with-tags` rendait autrefois tous les patients de l'etablissement, quel que soit
// le service consulte — les deux services montraient donc la meme liste, ce qui rendait toute
// demonstration de cloisonnement non concluante. La liste doit desormais ne rendre que les
// patients ayant un sous-dossier (`PatientServiceFile`) dans le service courant. Ce bloc utilise
// deux services du meme etablissement et un seul compte, membre coordinateur des deux, pour
// comparer directement ce que chaque service voit.
describe('cloisonnement de la liste des patients par service', () => {
  let testApp: TestApp
  let establishmentId: string
  let serviceAId: string
  let serviceBId: string
  let cookies: Cookies

  beforeAll(async () => {
    await truncateAll()
    const establishment = await createEstablishment('E-cloisonnement')
    establishmentId = establishment.id
    const serviceA = await createService(establishmentId, 'Service A')
    const serviceB = await createService(establishmentId, 'Service B')
    serviceAId = serviceA.id
    serviceBId = serviceB.id

    // Un seul compte, coordinateur des deux services : le point de comparaison est le meme
    // utilisateur qui change de service, pas deux utilisateurs differents.
    await createUser({
      email: 'coordo-deux-services@patient.fr',
      memberships: [
        {
          establishmentId,
          role: 'MEMBER',
          services: [
            { serviceId: serviceAId, role: 'COORDINATEUR' },
            { serviceId: serviceBId, role: 'COORDINATEUR' },
          ],
        },
      ],
    })

    testApp = await buildTestApp()
    cookies = await signIn(testApp.app, 'coordo-deux-services@patient.fr')
  })

  afterAll(async () => {
    await testApp.close()
    await testDb.$disconnect()
  })

  const listWithTags = (serviceId: string) =>
    testApp.app
      .inject({
        method: 'GET',
        url: tenantUrl(establishmentId, serviceId, '/patient/with-tags'),
        cookies,
      })
      .then((res) => res.json() as { id: string; entryDate: string | null }[])

  const createPatientInService = (serviceId: string, payload: unknown) =>
    testApp.app
      .inject({
        method: 'POST',
        url: tenantUrl(establishmentId, serviceId, '/patient'),
        cookies,
        payload: payload as never,
      })
      .then((res) => {
        expect(res.statusCode).toBe(201)
        return res.json().id as string
      })

  const writeServiceFile = (
    serviceId: string,
    patientId: string,
    payload: unknown,
  ) =>
    testApp.app
      .inject({
        method: 'PATCH',
        url: tenantUrl(
          establishmentId,
          serviceId,
          `/patient/${patientId}/service-file`,
        ),
        cookies,
        payload: payload as never,
      })
      .then((res) => {
        expect(res.statusCode).toBe(200)
      })

  it('un patient suivi uniquement dans le service A n apparait pas dans la liste du service B', async () => {
    const patientId = await createPatientInService(serviceAId, {
      firstName: 'Solo',
      lastName: 'ServiceA',
    })
    await writeServiceFile(serviceAId, patientId, {
      entryDate: '2026-01-15T00:00:00.000Z',
    })

    const listA = await listWithTags(serviceAId)
    expect(listA.map((p) => p.id)).toContain(patientId)

    const listB = await listWithTags(serviceBId)
    expect(listB.map((p) => p.id)).not.toContain(patientId)

    await testDb.patient.delete({ where: { id: patientId } })
  })

  it('un patient suivi dans les deux services apparait dans les deux listes, avec les donnees de chaque service et non celles de l autre', async () => {
    const patientId = await createPatientInService(serviceAId, {
      firstName: 'Double',
      lastName: 'Service',
    })
    await writeServiceFile(serviceAId, patientId, {
      entryDate: '2026-02-01T00:00:00.000Z',
    })
    await writeServiceFile(serviceBId, patientId, {
      entryDate: '2026-03-01T00:00:00.000Z',
    })

    const listA = await listWithTags(serviceAId)
    const listB = await listWithTags(serviceBId)

    const patientInA = listA.find((p) => p.id === patientId)
    const patientInB = listB.find((p) => p.id === patientId)
    expect(patientInA).toBeDefined()
    expect(patientInB).toBeDefined()
    expect(new Date(patientInA?.entryDate as string).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    )
    expect(new Date(patientInB?.entryDate as string).toISOString()).toBe(
      '2026-03-01T00:00:00.000Z',
    )

    await testDb.patient.delete({ where: { id: patientId } })
  })

  // Un patient cree par le bouton « Creer sans parcours » du formulaire d'ajout (POST /patient
  // seul, sans inscription ni diagnostic ni ecriture du sous-dossier — exactement ce que fait
  // `createPatientInService` ci-dessus) ne recevait AUCUN sous-dossier : plus aucun chemin de
  // creation ne rendait `ensureExists`, et le filtre de liste le faisait donc disparaitre de la
  // liste de TOUT service, y compris celui ou il vient d'etre cree. Il restait en base et dans
  // l'export (aucune route ne le supprime), mais sans porte d'entree normale pour le rouvrir —
  // une perte d'acces a un dossier de sante. Rouge avant le correctif de `PatientDomain.create`
  // (voir le commentaire au-dessus de l'appel a `ensureExists`), vert apres.
  it('un patient cree sans parcours apparait dans la liste du service ou il a ete cree, et pas dans celle de l autre', async () => {
    const patientId = await createPatientInService(serviceAId, {
      firstName: 'SansParcours',
      lastName: 'CreationDirecte',
    })

    const listA = await listWithTags(serviceAId)
    expect(listA.map((p) => p.id)).toContain(patientId)

    // Le cloisonnement doit tenir : reparer la visibilite dans le service de creation ne doit
    // pas faire apparaitre le patient dans un service qui ne le suit pas.
    const listB = await listWithTags(serviceBId)
    expect(listB.map((p) => p.id)).not.toContain(patientId)

    await testDb.patient.delete({ where: { id: patientId } })
  })
})
